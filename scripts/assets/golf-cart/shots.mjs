// T351 (#994): shot strips of the hire golf cart driving two scripted routes in the real game, before (main) and after, at the closest zoom and the middle one. A headless Edge on the GPU
// (the way scripts/perf/bench.mjs runs the game), the game's own cart driven by its own route code (the cart drives itself along a polyline exactly as it does when you click, or call it):
//   node scripts/assets/golf-cart/shots.mjs --url http://[::1]:5206/ --tag after [--zooms 0.3,0.15] [--slow 0.25] [--query "&oldcart=1"] [--out output/t351/shots]
// Two routes on open ground the cart may drive on (found with the game's own cartOk): an OCTAGON of eight legs of 6 tiles, one for each heading (E, SE, S, SW, W, NW, N, NE: every picture
// once and every bend a 45 degree turn), and a SQUARE of four 90 degree bends then a HAIRPIN (E, then W: a half turn). The camera follows the cart (the game's does not: T323). The page's
// clock runs at --slow (the rAF timestamps are scaled: everything the game does by its frame time runs that much slower), so a headless screenshot (about 150 ms each) catches a turn of 0.3 s in
// several frames. Writes <out>/<tag>-z<zoom>-frames.json (every frame: the route, the leg, the cart, the picture drawn) and the strips; --assemble DIR builds the comparison from two runs.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://[::1]:5206/'), tag = opt('tag', 'after'), zooms = opt('zooms', opt('zoom', '0.3')).split(',').map(Number), slow = +opt('slow', '0.25'), query = opt('query', ''), out = path.resolve(opt('out', 'output/t351/shots'));
fs.mkdirSync(out, { recursive: true });
const NAMES = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
/** the tile direction of each heading (unit) */
const R2 = Math.SQRT1_2, DIR = { E: [R2, -R2], SE: [1, 0], S: [R2, R2], SW: [0, 1], W: [-R2, R2], NW: [-1, 0], N: [-R2, -R2], NE: [0, -1] };
/** the people's facing (S SW W NW N NE E SE = 0..7) of a heading, for the cart's starting face */
const FACE = { S: 0, SW: 1, W: 2, NW: 3, N: 4, NE: 5, E: 6, SE: 7 };
function route(legs, x0, y0) { const pts = [[x0, y0]]; for (const [name, len] of legs) { const p = pts[pts.length - 1], d = DIR[name]; pts.push([p[0] + d[0] * len, p[1] + d[1] * len]); } return pts; }
const OCTAGON = NAMES.map(n => [n, 6]);
const SQUARE = [['E', 7], ['N', 7], ['W', 7], ['S', 7], ['E', 7], ['W', 9]];

const browser = await chromium.launch({ channel: opt('channel', 'msedge'), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader=false', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
// the page's clock: normal while the game starts (some of its timers mix performance.now and the frame's own time, so a clock scaled from the first frame can hold a start back), then
// window.__setSlow(k) slows it to k of real time: performance.now and the frames' timestamps are one scaled clock, continuous at the change
await ctx.addInitScript(() => {
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ }
  const realNow = performance.now.bind(performance), c = { k: 1, t0: 0, v0: 0 }, scaled = t => c.v0 + (Math.max(t, c.t0) - c.t0) * c.k;
  performance.now = () => scaled(realNow());
  const realRaf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => realRaf(t => cb(scaled(t)));
  window.__setSlow = k => { const now = realNow(); c.v0 = scaled(now); c.t0 = now; c.k = k; };
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
page.on('crash', () => console.log('[crash] the page crashed'));
await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); }); // (no save is written)
await page.goto(`${url}?start=town&seed=${opt('seed', '1')}&everyday=0&golfers=0${query}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 900000 });
await page.evaluate(() => {
  const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(0);
  const p = g.golf?.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } // (the tutorial card off)
  g.standInPill = () => {}; g.emit(); // (no "Your cart" pill over the roof)
});
await page.waitForTimeout(3000);
{ const t1 = Date.now(); while (!(await page.evaluate(() => !!window.__game?.you && !!window.__game?.youCart)) && Date.now() - t1 < 600000) { await page.waitForTimeout(2000); if ((Date.now() - t1) % 20000 < 2100) console.log('[wait] the game has no character yet', JSON.stringify(await page.evaluate(() => { const g = window.__game; return { golf: !!g?.golf, you: !!g?.you, cart: !!g?.youCart, speed: g?.speed, ready: !!g?.ready }; }))); } }
await page.waitForTimeout(2000);
await page.evaluate(k => window.__setSlow(k), slow);

// the cart, and open ground for the routes (found with the game's own cartOk over a spiral of 12-tile steps from where the cart waits)
const where = await page.evaluate(() => {
  const g = window.__game, c = g.youCart; if (!c) return null;
  // (ground the cart may drive on, with no prop of any kind in it: a tree would hide the cart in some of the frames)
  const free = (cx, cy, r) => {
    g.youRaster(cx, cy, r + 4, true); const S = new Set(); g.propGrid.query([cx - r - 4, cy - r - 4, cx + r + 4, cy + r + 4], S); if (S.size) return false;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (!g.cartOk(cx + dx, cy + dy)) return false;
    return true;
  };
  for (let ring = 0; ring <= 12; ring++) for (let a = 0; a < Math.max(1, ring * 8); a++) {
    const th = ring ? (a / (ring * 8)) * Math.PI * 2 : 0, cx = Math.round(c.x + Math.cos(th) * ring * 10), cy = Math.round(c.y + Math.sin(th) * ring * 10);
    if (free(cx, cy, 11)) return { cx, cy, ring };
  }
  return { cx: c.x, cy: c.y, ring: -1 };
});
if (!where) throw new Error('no cart in the game (no golf?)');
console.log('open ground', JSON.stringify(where));

/** drives the cart along a polyline, the camera on it, and takes a frame about every 150 ms until it arrives; returns the frames */
async function drive(label, legs, x0, y0, wanted, zoom) {
  const pts = route(legs, x0, y0), first = legs[0][0];
  await page.evaluate(({ pts, face, zoom }) => {
    const g = window.__game, c = g.youCart; g.youInCart = false;
    c.x = pts[0][0]; c.y = pts[0][1]; c.face = face; c.moving = false; c.keys = false; c.path.length = 0; if (g.cartDrive) g.cartDrive.reset(c);
    window.__zoom = zoom; window.__follow = true;
    if (!window.__followLoop) { window.__followLoop = true; const loop = () => { if (window.__follow) { g.cam.X = (c.x - c.y) * 64; g.cam.Y = (c.x + c.y) * 32; g.cam.z = window.__zoom; g.camEase = null; } requestAnimationFrame(loop); }; loop(); }
  }, { pts, face: FACE[first], zoom });
  await page.waitForTimeout(3500); // (the ground under the new place bakes; the cart stands on its first heading)
  await page.evaluate(({ pts }) => { const c = window.__game.youCart, P = c.path; P.length = 0; for (const p of pts) P.push(p[0], p[1]); c.seg = 1; c.run = false; c.moving = true; c.swing = -1; c.keys = false; c.tx = pts[pts.length - 1][0]; c.ty = pts[pts.length - 1][1]; c.mark = 0; c.skip = false; }, { pts });
  const frames = [], states = [], half = Math.round(60 / (zoom >= 0.25 ? 1 : 2));
  for (let n = 0; n < 6000; n++) {
    const st = await page.evaluate(() => {
      const g = window.__game, c = g.youCart, d = g.youCartDraw?.[0], p = g.screen(c.x, c.y);
      return { x: c.x, y: c.y, moving: c.moving, seg: c.seg, item: d ? d.item : -1, scale: d ? d.scale : 0, ang: g.cartDrive ? g.cartDrive.ang : null, v: g.cartDrive ? g.cartDrive.v : null, tg: g.lastFrame / 1000, sx: p.x, sy: p.y };
    });
    states.push(st);
    if (!st.moving && n > 3) break;
    if (!wanted(st, pts)) continue; // (only the frames the strips use are taken: a screenshot is the slow part)
    const clip = { x: Math.round(st.sx - half), y: Math.round(st.sy - half * 1.15), width: half * 2, height: half * 2 };
    frames.push({ st, i: states.length - 1, buf: await page.screenshot({ clip, type: 'png' }) });
  }
  await page.evaluate(() => { window.__follow = false; });
  console.log(label, states.length, 'states,', frames.length, 'frames,', new Set(states.map(f => f.item)).size, 'different pictures');
  return { pts, legs, frames, states, half };
}
/** the octagon: the cart within 0.4 tile of the middle of a leg; the square: within 1.6 tiles of a vertex (the bends) */
const nearMid = (st, pts) => pts.slice(1).some((p, k) => Math.hypot(st.x - (p[0] + pts[k][0]) / 2, st.y - (p[1] + pts[k][1]) / 2) < 0.4);
const nearVertex = (st, pts) => pts.slice(1, -1).some(p => Math.hypot(st.x - p[0], st.y - p[1]) < 1.6);
for (const zoom of zooms) {
  const oct = await drive('octagon', OCTAGON, where.cx - 3, where.cy + 1, nearMid, zoom), sq = await drive('square', SQUARE, where.cx - 5, where.cy - 5, nearVertex, zoom);

  // ---- the strips
  const SCALE = zoom >= 0.25 ? 2 : 4, W = oct.half * 2 * SCALE;
  async function tile(f, label) {
    const bar = Buffer.from(`<svg width="${W}" height="18" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="18" fill="rgba(0,0,0,0.6)"/><text x="4" y="13" font-family="sans-serif" font-size="12" fill="#fff">${label}</text></svg>`);
    return sharp(f.buf).resize({ width: W, kernel: 'nearest' }).composite([{ input: bar, top: 0, left: 0 }]).png().toBuffer();
  }
  /** the leg a frame is on: the cart's route segment (seg 1 is the first leg) */
  const legOf = f => Math.max(0, f.st.seg - 1);
  async function strip(frames, labels, cols, file) {
    const rows = Math.ceil(frames.length / cols), tiles = await Promise.all(frames.map((f, i) => tile(f, labels[i])));
    await sharp({ create: { width: cols * W, height: rows * W, channels: 3, background: '#223' } }).composite(tiles.map((input, i) => ({ input, left: (i % cols) * W, top: Math.floor(i / cols) * W }))).png().toFile(file);
  }
  // the octagon: the taken frame nearest the middle of each leg, with the picture the game drew (a library index: eight different ones, or the two there were)
  const midOf = (route, leg) => { const p = route.pts, m = [(p[leg][0] + p[leg + 1][0]) / 2, (p[leg][1] + p[leg + 1][1]) / 2]; return route.frames.map(f => [f, Math.hypot(f.st.x - m[0], f.st.y - m[1])]).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null; };
  const octMid = OCTAGON.map(([n], leg) => [n, midOf(oct, leg)]).filter(([, f]) => f);
  await strip(octMid.map(([, f]) => f), octMid.map(([n, f]) => `${n}: picture ${f.st.item}`), 4, path.join(out, `${tag}-z${zoom}-octagon.png`));
  // the bends of the square and the hairpin, one row a bend: the first frame of each picture the cart showed while it drove the vertex's neighbourhood (the cart within 1.6 tiles of it:
  // before the bend, through it, after it), so a turn that steps through its neighbours is a row of different pictures, and one that snaps is two
  const bends = [], rows = [];
  for (let leg = 1; leg < sq.legs.length; leg++) {
    const v = sq.pts[leg], near = sq.frames.filter(f => Math.hypot(f.st.x - v[0], f.st.y - v[1]) < 1.6 && Math.abs(f.st.seg - 1 - leg) <= 1), pick = []; let last = null;
    for (const f of near) if (f.st.item !== last) { pick.push(f); last = f.st.item; }
    if (near.length && pick[pick.length - 1] !== near[near.length - 1]) pick.push(near[near.length - 1]);
    const name = `${sq.legs[leg - 1][0]} to ${sq.legs[leg][0]}`; bends.push({ name, frames: near.length, pictures: pick.length - 1 });
    rows.push(pick.slice(0, 7).map((f, k) => ({ f, label: `${name} ${k + 1}: picture ${f.st.item}` })));
  }
  {
    const tiles = await Promise.all(rows.map(r => Promise.all(r.map(t => tile(t.f, t.label)))));
    await sharp({ create: { width: 7 * W, height: rows.length * W, channels: 3, background: '#223' } }).composite(tiles.flatMap((r, y) => r.map((input, x) => ({ input, left: x * W, top: y * W })))).png().toFile(path.join(out, `${tag}-z${zoom}-bends.png`));
  }
  console.log('bends', JSON.stringify(bends));
  fs.writeFileSync(path.join(out, `${tag}-z${zoom}-frames.json`), JSON.stringify({ tag, zoom, slow, query, octagon: oct.states, square: sq.states, bends }));
  console.log('written', out);

}
await browser.close();

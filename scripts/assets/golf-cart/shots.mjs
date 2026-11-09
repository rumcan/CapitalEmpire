// T351 (#994): shot strips of the hire golf cart driving in the real game, before (the same build with ?oldcart: the two pictures, the steady pace, the segment's heading) and after, at the
// closest zoom and the middle one. A headless Edge on the GPU (the way scripts/perf/bench.mjs runs the game), the game's own cart driven by its own code (it drives itself along a polyline
// exactly as it does when you click or call it, and under the keys as it does for you):
//   node scripts/assets/golf-cart/shots.mjs --url http://[::1]:5206/ --tag after [--zooms 0.3,0.15] [--step 50] [--query "&oldcart=1"] [--out output/t351/shots] [--only octagon,bends,keys]
// Three scenes on open ground the cart may drive on (found with the game's own cartOk and prop grid), at each zoom:
//   OCTAGON  a loop of eight legs of 3 tiles, one for each heading (E, SE, S, SW, W, NW, N, NE): the picture at the middle of each leg;
//   BENDS    a square (four 90 degree bends, then one the other way) and a hairpin (E then W): the pictures it shows through each bend;
//   KEYS     you in the cart: D, W, A, S held 1.1 s each, then let go: it steers, pulls away and rolls to a stop.
// The camera follows the cart (the game's does not: T323). The page's clock is STEPPED by this script: from the moment a scene starts, performance.now and the frames' timestamps only advance
// by --step ms each time the script asks for a frame (and the game draws exactly that frame), so a loaded PC drawing a few frames a second shows the same strips as a fast one: every frame is
// exactly --step ms of game time, and a screenshot is taken of exactly the frame the state was read from. Writes <out>/<tag>-z<zoom>-{octagon,bends,keys}.png, <tag>-z<zoom>-frames.json (every
// state) and <tag>-z<zoom>-<scene>-start.jpg (the scene's overview); compare.mjs stacks two runs.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://[::1]:5206/'), tag = opt('tag', 'after'), zooms = opt('zooms', opt('zoom', '0.3')).split(',').map(Number), STEP = +opt('step', '50'), query = opt('query', '');
const out = path.resolve(opt('out', 'output/t351/shots')), only = new Set(opt('only', 'octagon,bends,keys').split(','));
fs.mkdirSync(out, { recursive: true });
const NAMES = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
/** the tile direction of each heading (unit) */
const R2 = Math.SQRT1_2, DIR = { E: [R2, -R2], SE: [1, 0], S: [R2, R2], SW: [0, 1], W: [-R2, R2], NW: [-1, 0], N: [-R2, -R2], NE: [0, -1] };
/** the people's facing (S SW W NW N NE E SE = 0..7) of a heading, for the cart's starting face */
const FACE = { S: 0, SW: 1, W: 2, NW: 3, N: 4, NE: 5, E: 6, SE: 7 };
function route(legs, x0, y0) { const pts = [[x0, y0]]; for (const [name, len] of legs) { const p = pts[pts.length - 1], d = DIR[name]; pts.push([p[0] + d[0] * len, p[1] + d[1] * len]); } return pts; }
const OCTAGON = NAMES.map(n => [n, 3]);
const SQUARE = [['E', 3], ['N', 3], ['W', 3], ['S', 3], ['E', 3], ['W', 3]];

const browser = await chromium.launch({ channel: opt('channel', 'msedge'), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader=false', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  // the page's clock: the real one while the game starts and while a new place bakes; window.__manual(true) freezes performance.now and the frames' timestamps, and window.__step(ms) then
  // advances the clock by ms and runs the frame callbacks the game and the page asked for (one frame: the game's draw too); window.__manual(false) goes on from where the stepped clock stopped
  await ctx.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ }
    const realNow = performance.now.bind(performance), realRaf = window.requestAnimationFrame.bind(window), realCancel = window.cancelAnimationFrame.bind(window);
    const C = { manual: false, m: 0, off: 0 }, queue = []; let rid = 1e9;
    performance.now = () => (C.manual ? C.m : realNow() + C.off);
    window.requestAnimationFrame = cb => { if (C.manual) { queue.push([++rid, cb]); return rid; } return realRaf(t => cb(C.manual ? C.m : t + C.off)); };
    window.cancelAnimationFrame = id => { const i = queue.findIndex(q => q[0] === id); if (i >= 0) queue.splice(i, 1); else realCancel(id); };
    window.__manual = on => {
      if (on === C.manual) return;
      if (on) { C.m = realNow() + C.off; C.manual = true; } else { C.off = C.m - realNow(); C.manual = false; for (const [, cb] of queue.splice(0)) realRaf(t => cb(t + C.off)); }
    };
    window.__step = ms => { C.m += ms; if (window.__followOnce) window.__followOnce(); for (const [, cb] of queue.splice(0)) { try { cb(C.m); } catch (e) { console.error('[step]', e && e.message); } } };
    window.__present = () => new Promise(r => realRaf(() => realRaf(() => r(true)))); // (two real frames: what the step drew is on the screen)
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
  page.on('crash', () => console.log('[crash] the page crashed'));
  page.on('console', m => { const t = m.text(); if (t.startsWith('[step]')) console.log('[page]', t.slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); }); // (no save is written)
  await page.goto(`${url}?start=town&seed=${opt('seed', '1')}&everyday=0&golfers=0${query}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 900000 });
  await page.evaluate(() => {
    const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(0);
    const p = g.golf?.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } // (the tutorial card off)
    g.standInPill = () => {}; g.emit(); // (no "Your cart" pill over the roof)
  });
  await page.waitForTimeout(3000);
  { const t1 = Date.now(); while (!(await page.evaluate(() => !!window.__game?.you && !!window.__game?.youCart)) && Date.now() - t1 < 240000) { await page.waitForTimeout(2000); if ((Date.now() - t1) % 20000 < 2100) console.log('[wait] the game has no character yet', JSON.stringify(await page.evaluate(() => { const g = window.__game; return { golf: !!g?.golf, you: !!g?.you, cart: !!g?.youCart, speed: g?.speed, ready: !!g?.ready }; }))); } }
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.__cartState = () => {
      const g = window.__game, c = g.youCart, d = g.youCartDraw?.[0], p = g.screen(c.x, c.y);
      return { x: c.x, y: c.y, moving: c.moving, keys: c.keys, seg: c.seg, face: c.face, item: d ? d.item : -1, scale: d ? d.scale : 0, ang: g.cartDrive ? g.cartDrive.ang : null, v: g.cartDrive ? g.cartDrive.v : null, t: performance.now(), sx: p.x, sy: p.y };
    };
  });

  // the cart, and open ground for the routes (found with the game's own cartOk over a spiral of 10-tile steps from where the cart waits)
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
      if (free(cx, cy, 8)) return { cx, cy, ring };
    }
    return { cx: c.x, cy: c.y, ring: -1 };
  });
  if (!where) throw new Error('no cart in the game (no golf?)');
  console.log('open ground', JSON.stringify(where));

  /** waits for the game's ground to be baked (the bakes of a new place slow the frames): the worker idle for 20 polls in a row, at most 90 s (the page's own clock runs: not stepped) */
  async function settle() {
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__calm = 0; });
    await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
    await page.waitForTimeout(500);
  }
  /** n frames of STEP ms each (the clock stepped, the game drawing each), then the cart's state (n = 0: the state only) */
  const stepN = (n = 1) => page.evaluate(({ n, ms }) => { for (let i = 0; i < n; i++) window.__step(ms); return window.__cartState(); }, { n, ms: STEP });
  const present = () => page.evaluate(() => window.__present());
  const halfOf = zoom => Math.round(60 / (zoom >= 0.25 ? 1 : 2));
  /** the picture of the frame just drawn: a clip of the screen round the cart */
  async function grab(st, zoom) { await present(); const h = halfOf(zoom); return page.screenshot({ clip: { x: Math.round(st.sx - h), y: Math.round(st.sy - h * 1.15), width: h * 2, height: h * 2 }, type: 'png' }); }
  /** puts the cart (and you) on a place with the camera on it, the clock running, the ground baked; then freezes the clock */
  async function stage(label, x, y, face, zoom, inCart) {
    await page.evaluate(({ x, y, face, zoom, inCart }) => {
      const g = window.__game, c = g.youCart; g.keys.clear(); g.youInCart = inCart;
      c.x = x; c.y = y; c.face = face; c.moving = false; c.keys = false; c.path.length = 0; if (g.cartDrive) g.cartDrive.reset(c);
      if (inCart && g.you) { g.you.x = x; g.you.y = y; g.you.moving = false; g.you.keys = false; g.you.path.length = 0; }
      window.__zoom = zoom; window.__follow = true;
      window.__followOnce = () => { if (window.__follow) { g.cam.X = (c.x - c.y) * 64; g.cam.Y = (c.x + c.y) * 32; g.cam.z = window.__zoom; g.camEase = null; } };
      if (!window.__followLoop) { window.__followLoop = true; const loop = () => { window.__followOnce(); requestAnimationFrame(loop); }; loop(); }
    }, { x, y, face, zoom, inCart });
    await settle(); // (the ground under the new place bakes, and frames are slow until it has; the cart stands on its first heading)
    await page.evaluate(() => window.__manual(true));
    await stepN(3); // (it stands on its heading: the camera on it, drawn)
    await present(); await page.screenshot({ path: path.join(out, `${tag}-z${zoom}-${label}-start.jpg`), type: 'jpeg', quality: 55 });
  }
  const unstage = () => page.evaluate(() => { window.__follow = false; window.__game.youInCart = false; window.__manual(false); });

  /** drives the cart along a polyline (the way a click sends it) one frame at a time; `want(st, pts, memo)` says whether the frame is taken; returns the states and the frames */
  async function drive(label, legs, x0, y0, want, zoom) {
    const pts = route(legs, x0, y0);
    try {
      await stage(label, x0, y0, FACE[legs[0][0]], zoom, false);
      await page.evaluate(({ pts }) => { const c = window.__game.youCart, P = c.path; P.length = 0; for (const p of pts) P.push(p[0], p[1]); c.seg = 1; c.run = false; c.moving = true; c.swing = -1; c.keys = false; c.tx = pts[pts.length - 1][0]; c.ty = pts[pts.length - 1][1]; c.mark = 0; c.skip = false; }, { pts });
      const frames = [], states = [], memo = {}; let still = 0, last = null;
      for (let n = 0; n < 900; n++) {
        const st = await stepN(1); states.push(st);
        if (want(st, pts, memo)) frames.push({ st, i: states.length - 1, buf: await grab(st, zoom) });
        if (!st.moving && n > 3) break;
        if (last && Math.hypot(st.x - last.x, st.y - last.y) < 1e-9) { if (++still > 60) { console.log(`[${label}] the cart has not moved for ${still} frames: giving up (picture ${st.item}, seg ${st.seg})`); break; } } else still = 0;
        last = st;
      }
      console.log(`${label} z${zoom}: ${states.length} frames (${(states.length * STEP / 1000).toFixed(1)} s), ${frames.length} taken, ${new Set(states.map(s => s.item)).size} different pictures`);
      return { pts, legs, frames, states };
    } finally { await unstage(); }
  }
  /** the octagon: the first frame within 0.13 tile of the middle of each leg */
  const midWanted = (st, pts, memo) => { memo.done ??= new Set(); for (let k = 0; k < pts.length - 1; k++) { if (memo.done.has(k)) continue; const m = [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2]; if (Math.hypot(st.x - m[0], st.y - m[1]) < 0.13) { memo.done.add(k); return true; } } return false; };
  /** the square: within 1.6 tiles of a vertex (before the bend, through it, after it), the first frame there and the first frame of each different picture; then the first frame out of it */
  const bendWanted = (st, pts, memo) => {
    memo.last ??= new Map(); let want = false;
    for (let k = 1; k < pts.length - 1; k++) {
      const near = Math.hypot(st.x - pts[k][0], st.y - pts[k][1]) < 1.6 && (st.seg - 1 === k - 1 || st.seg - 1 === k), prev = memo.last.get(k); // (the legs either side of the vertex: the hairpin's way back passes the one before it)
      if (near) { if (prev === undefined || prev.item !== st.item) want = true; memo.last.set(k, { item: st.item, near: true }); } else if (prev && prev.near) { want = true; memo.last.set(k, { item: st.item, near: false }); }
    }
    return want;
  };
  /** you in the cart, the keys: D (the screen's right: the cart heads E), then W (N), A (W), S (S), each held for 1.1 s, then let go (0.6 s: it rolls on and stops). The game's own keys (g.keys)
   *  and its own youStep, so the cart steers, pulls away and rolls to a stop here as it does for a player. Taken: the first frame of each picture shown while a key is held, and the last */
  async function keyed(zoom, x0, y0) {
    try {
      await stage('keys', x0, y0, 6, zoom, true);
      const frames = [], states = [], marks = [];
      const phase = async (name, ms, key) => {
        if (key) await page.evaluate(k => window.__game.keys.add(k), key);
        let st = await stepN(0); const t0 = st.t, p0 = { x: st.x, y: st.y }; let lastItem = null;
        while (st.t - t0 < ms - 1e-6) {
          st = await stepN(1); st.key = name; states.push(st);
          if (st.item !== lastItem || st.t - t0 >= ms - 1e-6) { frames.push({ st, i: states.length - 1, buf: await grab(st, zoom) }); lastItem = st.item; }
        }
        if (key) await page.evaluate(k => window.__game.keys.delete(k), key);
        marks.push({ key: name, moved: +Math.hypot(st.x - p0.x, st.y - p0.y).toFixed(2), keysFlag: st.keys });
      };
      for (const [key, name] of [['d', 'E'], ['w', 'N'], ['a', 'W'], ['s', 'S']]) await phase(`hold ${key.toUpperCase()} (${name})`, 1100, key);
      await phase('keys let go', 600, null);
      { const before = states[states.length - 1], roll = await stepN(40); marks.push({ key: 'rolled on after the keys', moved: +Math.hypot(roll.x - before.x, roll.y - before.y).toFixed(2), keysFlag: roll.keys }); }
      console.log(`keys z${zoom}: ${states.length} frames, ${frames.length} taken, ${new Set(states.map(s => s.item)).size} different pictures`, JSON.stringify(marks.map(m => [m.key, m.moved])));
      return { frames, states, marks };
    } finally { await unstage(); }
  }

  for (const zoom of zooms) {
    const safe = async (name, fn) => { try { return await fn(); } catch (e) { console.log(`[${name} z${zoom}] FAILED: ${String(e?.stack ?? e).slice(0, 700)}`); return null; } }; // (a scene that fails does not stop the others)
    const oct = only.has('octagon') ? await safe('octagon', () => drive('octagon', OCTAGON, where.cx - 3.6, where.cy - 1.5, midWanted, zoom)) : null;
    const sq = only.has('bends') ? await safe('square', () => drive('square', SQUARE, where.cx, where.cy + 2.1, bendWanted, zoom)) : null;
    const kd = only.has('keys') ? await safe('keys', () => keyed(zoom, where.cx, where.cy + 1.5)) : null;

    // ---- the strips
    const half = halfOf(zoom), SCALE = zoom >= 0.25 ? 2 : 4, W = half * 2 * SCALE;
    async function tile(f, label) {
      const bar = Buffer.from(`<svg width="${W}" height="18" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="18" fill="rgba(0,0,0,0.6)"/><text x="4" y="13" font-family="sans-serif" font-size="12" fill="#fff">${label}</text></svg>`);
      return sharp(f.buf).resize({ width: W, kernel: 'nearest' }).composite([{ input: bar, top: 0, left: 0 }]).png().toBuffer();
    }
    /** a sheet of rows of tiles (as wide as its longest row) */
    async function sheet(rows, file) {
      if (!rows.some(r => r.length)) { console.log('no frames for', path.basename(file)); return; }
      const cols = Math.max(2, ...rows.map(r => r.length));
      const tiles = await Promise.all(rows.map(r => Promise.all(r.map(t => tile(t.f, t.label)))));
      await sharp({ create: { width: cols * W, height: rows.length * W, channels: 3, background: '#223' } }).composite(tiles.flatMap((r, y) => r.map((input, x) => ({ input, left: x * W, top: y * W })))).png().toFile(file);
    }
    const bends = [];
    if (oct) {
      // the octagon: the frame taken at the middle of each leg, with the picture the game drew (a library index: eight different ones, or the two there were)
      const midOf = leg => { const p = oct.pts, m = [(p[leg][0] + p[leg + 1][0]) / 2, (p[leg][1] + p[leg + 1][1]) / 2]; return oct.frames.map(f => [f, Math.hypot(f.st.x - m[0], f.st.y - m[1])]).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null; };
      const mids = OCTAGON.map(([n], leg) => ({ f: midOf(leg), label: n })).filter(t => t.f).map(t => ({ f: t.f, label: `${t.label}: picture ${t.f.st.item}` }));
      await sheet([mids.slice(0, 4), mids.slice(4, 8)], path.join(out, `${tag}-z${zoom}-octagon.png`));
    }
    if (sq) {
      // the bends of the square and the hairpin, one row a bend: the frames taken in the vertex's neighbourhood (the cart within 1.6 tiles of it, before the bend, through it, after it), so a
      // turn that steps through its neighbours is a row of different pictures, and one that snaps is two
      const rows = [];
      for (let leg = 1; leg < sq.legs.length; leg++) {
        const v = sq.pts[leg], near = sq.frames.filter(f => Math.hypot(f.st.x - v[0], f.st.y - v[1]) < 1.7 && (f.st.seg - 1 === leg - 1 || f.st.seg - 1 === leg)), pick = []; let last = null;
        for (const f of near) if (f.st.item !== last) { pick.push(f); last = f.st.item; }
        const name = `${sq.legs[leg - 1][0]} to ${sq.legs[leg][0]}`; bends.push({ name, frames: near.length, pictures: pick.length });
        rows.push(pick.slice(0, 7).map((f, k) => ({ f, label: `${name} ${k + 1}: picture ${f.st.item}` })));
      }
      await sheet(rows, path.join(out, `${tag}-z${zoom}-bends.png`));
      console.log('bends', JSON.stringify(bends));
    }
    if (kd?.frames.length) {
      // the keys: one row a key (hold D, W, A, S, then let go): the first frame of each picture shown, so a cart that steers is a row of neighbouring pictures and one that snaps is two
      const rows = ['hold D (E)', 'hold W (N)', 'hold A (W)', 'hold S (S)', 'keys let go'].map(name => kd.frames.filter(f => f.st.key === name).slice(0, 7).map((f, k) => ({ f, label: `${name} ${k + 1}: picture ${f.st.item}` })));
      await sheet(rows, path.join(out, `${tag}-z${zoom}-keys.png`));
    }
    const slim = s => s.map(({ x, y, item, ang, v, t, seg, key }) => ({ x: +x.toFixed(3), y: +y.toFixed(3), item, ang: ang === null ? null : +ang.toFixed(3), v: v === null ? null : +v.toFixed(3), t: +t.toFixed(1), seg, key }));
    fs.writeFileSync(path.join(out, `${tag}-z${zoom}-frames.json`), JSON.stringify({ tag, zoom, step: STEP, query, octagon: oct ? slim(oct.states) : null, square: sq ? slim(sq.states) : null, keys: kd ? slim(kd.states) : null, keyMarks: kd?.marks ?? null, bends }));
    console.log('written', out);
  }
} finally { await browser.close(); }

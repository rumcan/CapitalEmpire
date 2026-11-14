// #1276 (the owner, 2026-11-14: "make 45 degree bends the default ... always", "a click and drag and release builds like in sim city"): looks at the road tool's
// press, drag and release on a live page with real mouse events, and checks what the ticket asks of it. Headless Chrome with WebGL (playwright-core, the installed
// Chrome) on a scratch port of its own: the normal game on a vite dev server (?start=town&seed=7: a seeded town, its roads, the course), or the built jam
// (--jam: dist-jam, served by vite preview; build it first with: node scripts/jam/build.mjs --no-pack, through E:/ClaudeTemp/heavy.sh).
//   node scripts/dev/road-drag-shots.mjs [--jam] [--out docs/ui-shots] [--port N] [--bench] [--no-shots]
// It checks: the default bend is 45 after every load (Q toggles it for the visit only); a cart path dragged with one 45 degree bend (the ghost mid-drag, the built
// path, one undo step); a town street dragged onto an existing road (a T junction; the normal game) or a path dragged onto the path just built (the jam); a cancelled drag
// (Esc; a right click) builds nothing; a click without a drag is still click, click, Enter; a finger's drag (touch emulation) builds like the mouse's; in the jam, the range
// guide's Show me puts the Walking path in hand and a dragged run builds (the walkway's reach is told: in a set-back range the guide's car park ring is out of the lot's
// reach, which is no fault of the road tool). --bench measures what the preview costs per pointer move (the ghost's work in the draw, 3000 moves x 5 rounds, drag against
// hover, 90 against 45). Screenshots: <out>/road-drag-<normal|jam>-*.jpg. Prints PASS / FAIL per check (exit 1 on a FAIL). The server and the browser are closed at the end,
// whatever happens. The jam's start is J9's (the choose-your-start card: "Pick a spot for me"); a build from before it has no card and the flow skips it.
import { chromium } from 'playwright-core';
import { createServer as viteServer, preview } from 'vite';
import { createServer as netServer } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const JAM = has('jam'), TAG = JAM ? 'jam' : 'normal', ROOT = resolve('.'), SHOTS = resolve(opt('out', 'docs/ui-shots')), SHOOT = !has('no-shots'), BENCH = has('bench');
const W = 1500, H = 900;
const freePort = () => new Promise(res => { const s = netServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (JAM && !existsSync(resolve(ROOT, 'dist-jam', 'index.html'))) { console.error('no dist-jam/index.html: build it first (node scripts/jam/build.mjs --no-pack)'); process.exit(2); }
const port = Number(opt('port', 0)) || await freePort();
mkdirSync(SHOTS, { recursive: true });

let server, browser, failed = 0;
const check = (ok, label, note = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${note ? `  (${note})` : ''}`); return ok; };
const errors = [];
try {
  if (JAM) server = await preview({ root: ROOT, logLevel: 'error', build: { outDir: 'dist-jam' }, preview: { port, strictPort: true, host: '127.0.0.1' } });
  else { server = await viteServer({ root: ROOT, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1' }, clearScreen: false }); await server.listen(); }
  const base = `http://127.0.0.1:${port}/`;
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
  console.log(`road drag: ${TAG} on ${base} (Chrome ${browser.version()}), ${W}x${H}`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: false });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase?.('ce'); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });

  // ------------------------------------------------------------------ loading a game
  async function loadGame() {
    if (JAM) {
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.locator('[data-testid="title-card"]').waitFor({ timeout: 180000 });
      await page.locator('[data-testid="title-new"]').click(); await page.waitForTimeout(1500);
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
      const who = page.locator('button', { hasText: "That's me" }); await who.waitFor({ timeout: 60000 });
      await page.locator('input[placeholder="Your name"]').fill('Road Drag').catch(() => {});
      for (const w of ['Desert', 'Autumn']) { const b = page.locator('button', { hasText: w }).first(); if (await b.isVisible().catch(() => false)) await b.click().catch(() => {}); }
      await who.click(); await page.waitForTimeout(1500);
      // J9: the start is chosen, not laid: the card over the bare map; "Pick a spot for me" buys the land and the old range and builds the house (a build from before J9 has no card)
      const pick = page.locator('[data-testid="start-pick-auto"]');
      if (await pick.waitFor({ timeout: 20000 }).then(() => true, () => false)) {
        await pick.click();
        await page.waitForFunction(() => { const g = window.__game; return !g.startPick && !!g.range?.scene; }, null, { timeout: 90000 }).catch(() => console.log('      (the start was not laid in time)'));
        await page.waitForTimeout(2500);
      }
      await page.evaluate(() => { const g = window.__game; g.setSpeed(0); const p = g.golf?.progress; if (p?.tour) p.tour.off = true; g.emit(); });
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    } else {
      await page.goto(`${base}?start=town&seed=7`, { waitUntil: 'domcontentloaded', timeout: 900000 }); // (the dev server compiles on the first load, and the PC is shared: minutes)
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 900000 });
      await page.evaluate(() => {
        const g = window.__game; g.closeWho?.('Pat Owner', 2); g.closeWelcome?.(false); g.openEventCard?.(null); g.setSpeed(0);
        g.traffic.budget.money = Math.max(g.traffic.budget.money, 1e8);
        const p = g.golf?.progress; if (p) { for (const k of ['who', 'welcome']) if (p.seen && !p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; }
        g.emit();
      });
      await sleep(1500);
      await page.evaluate(() => { window.__game.openEventCard?.(null); window.__game.emit(); });
    }
    await sleep(500);
  }
  await loadGame();

  // ------------------------------------------------------------------ helpers
  const G = fn => page.evaluate(fn);
  const settle = async (ms = 700) => {
    await page.waitForTimeout(ms);
    await page.evaluate(() => { window.__calm = 0; });
    await page.waitForFunction(() => { const g = window.__game; window.__calm = (g.ground?.busy ?? 0) === 0 ? window.__calm + 1 : 0; return window.__calm > 15; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('      (settle timed out)'));
    await page.waitForTimeout(250);
  };
  /** the part of the window the action is in (css px), set by frame(); a shot is cut to it so the thin ghost is read at a glance */
  let clip = null;
  const shot = async name => { if (!SHOOT) return; const f = resolve(SHOTS, `road-drag-${TAG}-${name}.jpg`); await page.screenshot({ path: f, type: 'jpeg', quality: 78, ...(clip ? { clip } : {}) }); console.log(`      wrote road-drag-${TAG}-${name}.jpg`); };
  /** the camera on tiles a and b at the closest zoom, and the shot's clip round them (at least 760 x 460, kept on the window) */
  const frame = async (a, b) => {
    const fx0 = 450, fx1 = W - 340, fy0 = 90, fy1 = H - 130; // (the free part of the window: the tool panel is at the left, the cards at the right, the bars above and below)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    await camAt(mid.x, mid.y, 0.3);
    // the closest zoom (0.3 at most) at which the whole run and its cost label (to the right of the pointer, about 200 px) stand in the free part of the window
    const q0 = await toPx(a.x, a.y), q1 = await toPx(b.x, b.y);
    const k = Math.min(1, (fx1 - fx0) / (Math.abs(q0.x - q1.x) + 80 + 210), (fy1 - fy0) / (Math.abs(q0.y - q1.y) + 130));
    if (k < 1) await camAt(mid.x, mid.y, Math.max(0.08, 0.3 * k));
    // the route's middle in the middle of that free part (a little left of it: the label is on the right), not of the window, which the cards and the panel crowd
    await page.evaluate(([dx, dy]) => { const g = window.__game; g.camEase = null; g.cam.X -= dx / g.cam.z; g.cam.Y -= dy / g.cam.z; g.emit(); }, [(fx0 + fx1) / 2 - 50 - W / 2, (fy0 + fy1) / 2 - H / 2]);
    await settle(1200);
    const pa = await toPx(a.x, a.y), pb = await toPx(b.x, b.y), x0 = Math.min(pa.x, pb.x) - 90, x1 = Math.max(pa.x, pb.x) + 250, y0 = Math.min(pa.y, pb.y) - 100, y1 = Math.max(pa.y, pb.y) + 100;
    const w = Math.min(fx1 - fx0, Math.max(700, x1 - x0)), h = Math.min(fy1 - fy0, Math.max(440, y1 - y0)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    clip = { x: Math.round(Math.max(fx0, Math.min(fx1 - w, cx - w / 2))), y: Math.round(Math.max(fy0, Math.min(fy1 - h, cy - h / 2))), width: Math.round(w), height: Math.round(h) };
    return { pa, pb };
  };
  const toPx = (x, y) => page.evaluate(([x, y]) => { const g = window.__game, s = g.screen(x, y); return { x: s.x / g.dpr, y: s.y / g.dpr }; }, [x, y]);
  const camAt = (cx, cy, z) => page.evaluate(([cx, cy, z]) => { const g = window.__game; g.camEase = null; g.lookAt(cx, cy, z); }, [cx, cy, z]);
  const state = () => page.evaluate(() => {
    const g = window.__game, legs = g.previewLegs();
    return { tool: g.tool, scope: g.roadScope, cls: g.roadClass, bend: g.bendMode, route: g.route.length, dragging: g.routeDragging, legs: legs.map(l => ({ a: l.a, b: l.b })), block: g.routeBlock(legs), segs: g.net.segs.size ?? [...g.net.segs].length, money: Math.round(g.money), toasts: g.toasts.slice(-3).map(t => t.text) };
  });
  const segCount = () => page.evaluate(() => { const s = window.__game.net.segs; return s.size ?? [...s].length; });
  const lastToasts = () => page.evaluate(() => window.__game.toasts.slice(-4).map(t => t.text));
  /** a leg's heading on the lattice: 0, 90 (the axes), 45 or 135 (the diagonals), -1 off it */
  const heading = l => { const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, ax = Math.abs(dx), ay = Math.abs(dy); if (ax < 1e-6 && ay < 1e-6) return -2; if (ay < 1e-6) return 0; if (ax < 1e-6) return 90; if (Math.abs(ax - ay) < 1e-6) return dx * dy > 0 ? 45 : 135; return -1; };
  const free = async (x, y) => (await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}${e.id ? '#' + e.id : ''}` : 'none'; }, [x, y]));

  /** arms the cart path tool (the jam: through the Build menu's Cart paths card, as a player does; the normal game: the engine's Paths & drives) with a class */
  async function armPath(cls) {
    await page.evaluate(() => { const g = window.__game; g.cancelRoute(); g.setTool('select'); });
    if (JAM) {
      if (!(await page.locator('[data-testid="build-menu"]').isVisible().catch(() => false))) await page.locator('[data-rail="build"]').click();
      await page.locator('[data-testid="build-menu"]').waitFor({ timeout: 6000 });
      const tab = page.locator('[data-testid="build-tab-course"]'); if (await tab.count()) await tab.click();
      await page.locator('[data-testid="build-card-paths"]').click(); await page.waitForTimeout(500);
      const ok = await page.evaluate(() => { const g = window.__game; return g.tool === 'road' && g.uiTool === 'path'; });
      check(ok, `${TAG}: the Build menu's Cart paths card puts the path tool in hand`);
    } else await page.evaluate(() => { window.__game.setTool('path'); });
    await page.evaluate(c => { const g = window.__game; if (c) g.roadClass = c; g.emit(); }, cls);
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => { const g = window.__game; return { tool: g.tool, scope: g.roadScope, cls: g.roadClass, toast: g.toasts.slice(-1)[0]?.text ?? '' }; });
    const id = await page.evaluate(() => window.__game.cls.id);
    check(t.tool === 'road' && t.scope === 'course' && (!cls || id === cls), `${TAG}: the path tool is in hand (${id})`, t.tool === 'road' ? '' : `tool ${t.tool}: ${t.toast}`);
  }
  const armStreet = () => page.evaluate(() => { const g = window.__game; g.cancelRoute(); g.setTool('road'); g.pickType('street'); g.emit(); });

  /** a free spot for a route of (dx, dy) tiles from a start: scans round the camera's tile; the engine judges each (its own preview and block), a route of 2 legs wanted */
  const plan = (dx, dy, o = {}) => page.evaluate(([dx, dy, o]) => {
    const g = window.__game, c = g.tileAt(g.cssW / 2, g.cssH / 2), cx = o.cx ?? Math.round(c.x), cy = o.cy ?? Math.round(c.y);
    const tried = []; const want = o.legs ?? 2;
    for (let r = 0; r <= 140; r += 7) for (let k = 0; k < (r ? 12 : 1); k++) {
      const a = (k / 12) * Math.PI * 2, A = { x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) };
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const B = { x: A.x + sx * dx, y: A.y + sy * dy };
        g.cancelRoute(); if (g.startBlock(A)) continue;
        // (open: no road within 16 tiles of the run, so the picture shows the ghost on bare ground)
        if (o.open && [[A.x, A.y], [(A.x + B.x) / 2, (A.y + B.y) / 2], [B.x, B.y]].some(([x, y]) => [...g.net.segsNear({ x, y }, 16)].length)) continue;
        // (the press and the end land on the grid as planned: a point within the snap radius of a road or a node snaps to it, and that is another route)
        g.hover = A; const sa = g.cursorSnap(); g.hover = B; const sb = g.cursorSnap(); if (!sa || !sb || sa.kind !== 'grid' || sb.kind !== 'grid') { g.hover = null; continue; }
        g.route = [A]; g.routeFrom = g.routeLast = { p: A, kind: 'grid' }; g.hover = B;
        const legs = g.previewLegs(), why = g.routeBlock(legs), kinds = why ? [] : g.structured(legs).kinds; g.cancelRoute(); g.hover = null;
        if (!why && legs.length === want && kinds.every(k => k === 0)) return { A, B, legs: legs.length }; // (on the ground: no bridge or tunnel in the picture)
        if (tried.length < 3) tried.push(why || `${legs.length} legs`);
      }
    }
    return { none: true, tried };
  }, [dx, dy, o]);

  /** a real mouse drag from tile A to tile B: press, move in steps, (shot and read the state mid-drag), and optionally release; returns the mid-drag state */
  async function drag(A, B, { name, release = true, steps = 14, hold = 350 } = {}) {
    const a = await toPx(A.x, A.y), b = await toPx(B.x, B.y);
    await page.mouse.move(a.x, a.y); await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps }); await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.waitForTimeout(hold);
    const mid = await state();
    if (name) await shot(`${name}-1-drag`);
    if (release) await page.mouse.up();
    return { mid, a, b };
  }

  // ------------------------------------------------------------------ 1. the default bend, after every load
  console.log('== the default bend');
  let st = await state();
  check(st.bend === 45, `${TAG}: a fresh game starts with 45 degree bends`, `bendMode ${st.bend}`);
  await page.keyboard.press('q'); await page.waitForTimeout(150);
  check((await state()).bend === 90, `${TAG}: Q toggles to 90 for the visit`);
  await page.keyboard.press('q'); await page.waitForTimeout(150);
  check((await state()).bend === 45, `${TAG}: Q toggles back to 45`);
  await page.keyboard.press('q'); await page.waitForTimeout(150); // left on 90: the next load must not remember it (checked at the end)

  // ------------------------------------------------------------------ 1b. the range guide's walking path step (the jam): Show me, then two dragged runs
  if (JAM) {
    console.log("== the range guide's walking path step");
    await page.evaluate(() => { const g = window.__game; g.cancelRoute(); g.setTool('select'); g.guideShowMe('guide-range-path'); });
    await page.waitForFunction(() => !window.__game.camEase, null, { timeout: 20000 }).catch(() => {});
    await settle(1200);
    const w = await page.evaluate(() => {
      const g = window.__game, sc = g.range.scene; if (!sc) return null;
      const t = sc.anchors.tee, m = { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 };
      return { tool: g.tool, ui: g.uiTool, cls: g.roadClass, lot: { x: sc.carEdge.x, y: sc.carEdge.y }, shop: { x: sc.counter.x, y: sc.counter.y }, tee: m, walkway: g.range.hasWalkway(), reach: g.range.walkReach() };
    });
    check(!!w && w.tool === 'road' && w.ui === 'path' && w.cls === 'cart-walk', `${TAG}: the guide's Show me puts the Walking path in hand`, w ? `${w.tool} / ${w.ui} / ${w.cls}` : 'no range scene');
    if (w) {
      check(!w.walkway, `${TAG}: no walkway yet`, JSON.stringify(w.reach));
      /** a run from near P to near Q the engine accepts (the walking path's reach is 3 tiles); fixedA keeps the start (the end of the run before) */
      const find = (P, Q, fixedA) => page.evaluate(([P, Q, fixedA]) => {
        const g = window.__game, st = 0.5, R = 4, offs = []; for (let i = -R; i <= R; i += 0.5) for (let j = -R; j <= R; j += 0.5) offs.push({ x: i, y: j, d: Math.hypot(i, j) });
        offs.sort((a, b) => a.d - b.d); const at = (T, o) => ({ x: Math.round((T.x + o.x) / st) * st, y: Math.round((T.y + o.y) / st) * st });
        const As = fixedA ? [fixedA] : offs.slice(0, 60).map(o => at(P, o)), Bs = offs.slice(0, 220).map(o => at(Q, o)); let tried = 0;
        for (const A of As) { if (g.startBlock(A)) continue; for (const B of Bs) {
          if (Math.hypot(B.x - A.x, B.y - A.y) < 4) continue;
          g.cancelRoute(); g.route = [A]; g.routeFrom = g.routeLast = { p: A, kind: 'grid' }; g.hover = B;
          const legs = g.previewLegs(), why = g.routeBlock(legs); g.cancelRoute(); g.hover = null; tried++;
          if (!why && legs.length >= 1) return { A, B, legs: legs.length, tried };
        } }
        return { none: true, tried };
      }, [P, Q, fixedA ?? null]);
      // how far the car park's ring is from the lot anchor the walkway must reach (WALK_REACH 3): the guide's ring marks the car park's edge, and a path laid to it is judged by the lot
      const dl = await page.evaluate(() => { const g = window.__game, sc = g.range.scene, lot = sc.anchors.lot, e = sc.carEdge; let d = Infinity; for (let i = 0; i < lot.length; i++) { const a = lot[i], b = lot[(i + 1) % lot.length], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((e.x - a.x) * dx + (e.y - a.y) * dy) / (dx * dx + dy * dy || 1))); d = Math.min(d, Math.hypot(e.x - a.x - dx * t, e.y - a.y - dy * t)); } return { d, setback: g.golf?.range?.setback ?? 0, lot: lot.map(p => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' '), ring: `${e.x.toFixed(1)},${e.y.toFixed(1)}` }; });
      console.log(`      the car park's ring is ${dl.d.toFixed(1)} tiles from the lot anchor (reach 3); setback ${dl.setback}; ring ${dl.ring}; lot ${dl.lot}`);
      const r1 = await find(w.lot, w.shop, null);
      check(!r1.none, `${TAG}: a run from the car park's edge to the shop's counter`, r1.none ? `none after ${r1.tried}` : `${r1.legs} leg(s) from ${r1.A.x},${r1.A.y} to ${r1.B.x},${r1.B.y}`);
      let r2 = null;
      if (!r1.none) {
        await frame(r1.A, r1.B); // (the ends are on the map, off the panels)
        await drag(r1.A, r1.B, { name: null, steps: 10, hold: 200 }); await page.waitForTimeout(500);
        const reach = await page.evaluate(() => window.__game.range.walkReach()), t1 = (await lastToasts()).pop() ?? '';
        check(/^Built .* of walking path/.test(t1), `${TAG}: the dragged run builds a walking path`, t1);
        console.log(`      reach after the first run: ${JSON.stringify(reach)}`);
        if (dl.d <= 3) check(!!reach && reach.lot && reach.shop, `${TAG}: the first dragged run reaches the car park and the shop`, JSON.stringify(reach));
        r2 = await find(r1.B, w.tee, r1.B);
        console.log(`      a run on from the counter to the back of the mats: ${r2.none ? `none after ${r2.tried}` : `${r2.legs} leg(s) to ${r2.B.x},${r2.B.y}`}`);
      }
      if (r2 && !r2.none) {
        await drag(r2.A, r2.B, { name: null, steps: 10, hold: 200 }); await page.waitForTimeout(700);
        const done = await page.evaluate(() => ({ walkway: window.__game.range.hasWalkway(), reach: window.__game.range.walkReach(), toast: window.__game.toasts.slice(-1)[0]?.text ?? '' }));
        console.log(`      reach after the second run: ${JSON.stringify(done.reach)}; walkway ${done.walkway}`);
        if (dl.d <= 3) check(done.walkway, `${TAG}: the dragged runs make the walking path: the guide's step is met`, `${JSON.stringify(done.reach)} ${done.toast}`);
        clip = null; await settle(1500); await shot('walkway');
      }
    }
    await page.evaluate(() => { const g = window.__game; g.cancelRoute(); g.setTool('select'); });
  }

  // ------------------------------------------------------------------ 2. a cart path dragged with one 45 degree bend
  console.log('== a cart path dragged');
  await page.keyboard.press('q'); await page.waitForTimeout(150); // back to 45 for the shots
  await armPath(JAM ? 'cart-dirt' : 'cart');
  let p = await plan(26, 9, { open: true });
  if (p.none) p = await plan(26, 9); // (a town with no open land round the camera: any free spot)
  check(!p.none, `${TAG}: a free spot for a path of 26 x 9 tiles`, p.none ? JSON.stringify(p.tried) : `from ${p.A.x},${p.A.y} to ${p.B.x},${p.B.y}`);
  let pathA = null, pathB = null;
  if (!p.none) {
    pathA = p.A; pathB = p.B;
    const { pa: a0, pb: b0 } = await frame(p.A, p.B);
    check((await free(a0.x, a0.y)) === 'CANVAS' && (await free(b0.x, b0.y)) === 'CANVAS', `${TAG}: both ends of the drag are on the map, not under a panel`, `${await free(a0.x, a0.y)} / ${await free(b0.x, b0.y)}`);
    const before = await segCount();
    const { mid } = await drag(p.A, p.B, { name: 'path', release: false });
    check(mid.dragging && mid.route === 1, `${TAG}: mid-drag: the press began a route and is still down`, `route ${mid.route}, dragging ${mid.dragging}`);
    check(mid.legs.length === 2 && mid.legs.every(l => heading(l) >= 0) && heading(mid.legs[0]) % 90 !== 0 && heading(mid.legs[1]) % 90 === 0, `${TAG}: mid-drag: the ghost is a diagonal run, one 45 degree bend, a straight run`, mid.legs.map(l => `${heading(l)}deg`).join(' + '));
    check(mid.block === '', `${TAG}: mid-drag: nothing refuses it`, mid.block);
    check((await segCount()) === before, `${TAG}: mid-drag: nothing is built while the button is down`);
    await page.mouse.up(); await page.waitForTimeout(600);
    const after = await state(), toasts = await lastToasts();
    check(after.route === 0 && !after.dragging, `${TAG}: the release builds and leaves no route in hand`, `route ${after.route}`);
    check(/^Built .* of (walking|dirt|cement|paved)/.test(toasts[toasts.length - 1] ?? ''), `${TAG}: the game says what it built and for how much`, toasts[toasts.length - 1] ?? '');
    const mine = await page.evaluate(([A, jam]) => [...window.__game.net.segs].filter(s => s.cls.id.startsWith('cart') && Math.abs(s.a.x - A.x) <= 27 && Math.abs(s.a.y - A.y) <= 27 && Math.abs(s.b.x - A.x) <= 27 && Math.abs(s.b.y - A.y) <= 27).map(s => ({ a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y }, cls: s.cls.id })), [p.A, JAM]);
    check((await segCount()) > before && mine.length >= 2 && mine.every(s => heading(s) >= 0), `${TAG}: the built path is on the 0 / 45 / 90 lattice`, mine.map(s => `${heading(s)}`).join(' '));
    await settle(2200); await frame(p.A, p.B); await settle(600);
    await shot('path-2-built');
    // one undo step takes the whole path back
    await page.keyboard.press('Control+z'); await page.waitForTimeout(700);
    check((await segCount()) === before, `${TAG}: Ctrl+Z takes the dragged path back in one step`, `${before} -> ${await segCount()}`);
    await page.keyboard.press('Control+y'); await page.waitForTimeout(700);
    check((await segCount()) > before, `${TAG}: Ctrl+Y builds it again`);
  }

  // ------------------------------------------------------------------ 3. joining an existing road
  console.log(JAM ? '== a path dragged onto the path just built' : '== a town street dragged onto an existing road');
  if (!JAM) await armStreet(); else await armPath(null);
  const jp = await page.evaluate(([jam, pathA]) => {
    const g = window.__game, land = g.golfLand?.() ?? [], inLand = (x, y) => land.some(([rx, ry, rw, rh]) => x > rx - 4 && x < rx + rw + 4 && y > ry - 4 && y < ry + rh + 4);
    const segs = [...g.net.segs].filter(s => (jam ? s.cls.family === 'cart' : !['cart', 'course'].includes(s.cls.family)) && Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) >= (jam ? 16 : 24) && (jam || !inLand((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2)));
    // nearest the camera first (the jam: the path just built)
    const c = g.tileAt(g.cssW / 2, g.cssH / 2); segs.sort((p, q) => Math.hypot((p.a.x + p.b.x) / 2 - c.x, (p.a.y + p.b.y) / 2 - c.y) - Math.hypot((q.a.x + q.b.x) / 2 - c.x, (q.a.y + q.b.y) / 2 - c.y));
    for (const s of segs.slice(0, 40)) {
      const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), u = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L }, n = { x: -u.y, y: u.x };
      for (const t of [0.5, 0.4, 0.6, 0.35, 0.65]) for (const d of [20, 26, 32, -20, -26, -32]) for (const o of [-8, -4, 0, 4, 8]) {
        const M = { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }, A = { x: Math.round(M.x + n.x * d + u.x * o), y: Math.round(M.y + n.y * d + u.y * o) };
        g.cancelRoute(); if (g.startBlock(A)) continue;
        g.route = [A]; g.routeFrom = g.routeLast = { p: A, kind: 'grid' }; g.hover = { x: M.x, y: M.y };
        const legs = g.previewLegs(), why = g.routeBlock(legs), cs = g.cursorSnap(), kinds = why ? [] : g.structured(legs).kinds; g.cancelRoute(); g.hover = null;
        if (!why && legs.length >= 1 && cs && cs.kind !== 'grid' && kinds.every(k => k === 0)) return { A, M: { x: M.x, y: M.y }, seg: { a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y }, cls: s.cls.id }, legs: legs.map(l => ({ a: { x: l.a.x, y: l.a.y }, b: { x: l.b.x, y: l.b.y } })), kind: cs.kind };
      }
    }
    return { none: true, segs: segs.length };
  }, [JAM, pathA]);
  check(!jp.none, `${TAG}: a free spot to drag onto an existing ${JAM ? 'path' : 'street'}`, jp.none ? `${jp.segs} candidates, none fits` : `from ${jp.A.x},${jp.A.y} to the road at ${jp.M.x.toFixed(1)},${jp.M.y.toFixed(1)} (${jp.kind})`);
  if (!jp.none) {
    await frame(jp.A, jp.M);
    const nodesBefore = await page.evaluate(() => [...window.__game.net.nodes.values()].filter(n => n.segs.length >= 3).length), before = await segCount();
    const { mid } = await drag(jp.A, jp.M, { name: 'join', release: false });
    check(mid.dragging && mid.legs.length >= 1 && mid.legs.every(l => heading(l) >= 0) && mid.block === '', `${TAG}: mid-drag: the ghost reaches the road, on the lattice, refused by nothing`, `${mid.legs.map(l => heading(l) + 'deg').join(' + ')} ${mid.block}`);
    await page.mouse.up(); await page.waitForTimeout(700);
    const after = await state(), toasts = await lastToasts(), last = toasts[toasts.length - 1] ?? '';
    check(after.route === 0 && (JAM ? /^Built .* of (walking|dirt|cement|paved)/ : /^Built .* of street/).test(last), `${TAG}: the release builds the ${JAM ? 'path' : 'street'}`, last);
    const nodesAfter = await page.evaluate(() => [...window.__game.net.nodes.values()].filter(n => n.segs.length >= 3).length);
    const atRoad = await page.evaluate(M => [...window.__game.net.nodes.values()].some(n => n.segs.length >= 3 && Math.hypot(n.x - M.x, n.y - M.y) < 4), jp.M);
    check(nodesAfter >= nodesBefore + 1 && atRoad && (await segCount()) > before, `${TAG}: it joined the road: a new junction where it meets it`, `junctions ${nodesBefore} -> ${nodesAfter}, one within 4 tiles of the pointer: ${atRoad}`);
    await settle(2200); await frame(jp.A, jp.M); await settle(600);
    await shot('join-2-built');
  }

  // ------------------------------------------------------------------ 4. a cancelled drag
  console.log('== a cancelled drag');
  if (!JAM) await armStreet(); else await armPath(null);
  const pc = await plan(24, 10, { legs: 2, cx: pathA ? pathA.x + 14 : undefined, cy: pathA ? pathA.y - 26 : undefined });
  check(!pc.none, `${TAG}: a free spot for the cancelled drags`, pc.none ? JSON.stringify(pc.tried) : `from ${pc.A.x},${pc.A.y}`);
  if (!pc.none) {
    await frame(pc.A, pc.B);
    let before = await segCount();
    // Esc during the drag
    let { mid } = await drag(pc.A, pc.B, { name: 'cancel-esc', release: false });
    check(mid.dragging && mid.legs.length === 2, `${TAG}: Esc test: the ghost is up mid-drag`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    let s2 = await state();
    check(s2.route === 0 && !s2.dragging && s2.legs.length === 0, `${TAG}: Esc drops the route and the drag`, `route ${s2.route}, dragging ${s2.dragging}, legs ${s2.legs.length}`);
    await shot('cancel-esc-2-after');
    await page.mouse.up(); await page.waitForTimeout(500);
    check((await segCount()) === before, `${TAG}: letting go after Esc builds nothing`, `${before} -> ${await segCount()}`);
    // a right click while the left button is held
    ({ mid } = await drag(pc.A, pc.B, { name: null, release: false }));
    check(mid.dragging && mid.legs.length === 2, `${TAG}: right click test: the ghost is up mid-drag`);
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(100); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(300);
    s2 = await state();
    check(s2.route === 0 && !s2.dragging, `${TAG}: a right click during the drag drops the route and the drag`, `route ${s2.route}, dragging ${s2.dragging}, tool ${s2.tool}`);
    await page.mouse.up(); await page.waitForTimeout(500);
    check((await segCount()) === before, `${TAG}: letting go after the right click builds nothing`, `${before} -> ${await segCount()}`);
    check(s2.tool === 'road', `${TAG}: the right click cancelled the drag only: the road tool is still in hand`);
  }

  // ------------------------------------------------------------------ 5. the old way: click, click, Enter
  console.log('== click, click, Enter (the old way)');
  if (!JAM) await armStreet(); else await armPath(null);
  const pk = await plan(22, 8, { legs: 2, cx: pathA ? pathA.x - 12 : undefined, cy: pathA ? pathA.y + 30 : undefined });
  check(!pk.none, `${TAG}: a free spot for the click route`, pk.none ? JSON.stringify(pk.tried) : `from ${pk.A.x},${pk.A.y}`);
  if (!pk.none) {
    const { pa: a, pb: b } = await frame(pk.A, pk.B);
    const before = await segCount();
    await page.mouse.move(a.x, a.y); await page.waitForTimeout(100); await page.mouse.down(); await page.mouse.move(a.x + 2, a.y + 1); await page.mouse.up(); await page.waitForTimeout(300);
    let s3 = await state();
    check(s3.route === 1 && !s3.dragging, `${TAG}: a press and release on the spot begins the route and leaves it in hand`, `route ${s3.route}`);
    await page.mouse.move(b.x, b.y, { steps: 10 }); await page.waitForTimeout(300);
    s3 = await state();
    check(s3.route === 1 && s3.legs.length === 2, `${TAG}: the ghost follows the pointer with no button down`, `legs ${s3.legs.length}`);
    await shot('click-1-ghost');
    await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300);
    s3 = await state();
    check(s3.route === 3, `${TAG}: the second click adds the bend and the end`, `route ${s3.route}`);
    check((await segCount()) === before, `${TAG}: nothing is built by the clicks`);
    await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    s3 = await state();
    check(s3.route === 0 && (await segCount()) > before, `${TAG}: Enter builds it`, `segs ${before} -> ${await segCount()}`);
  }

  // ------------------------------------------------------------------ 5c. a finger: a touch drag builds the same (touch emulation: pointer events of type touch)
  console.log('== a touch drag');
  if (!JAM) await armStreet(); else await armPath(null);
  const pt = await plan(22, 8, { legs: 2, cx: pathA ? pathA.x + 30 : undefined, cy: pathA ? pathA.y + 30 : undefined });
  check(!pt.none, `${TAG}: a free spot for the touch drag`, pt.none ? JSON.stringify(pt.tried) : `from ${pt.A.x},${pt.A.y}`);
  if (!pt.none) {
    const { pa, pb } = await frame(pt.A, pt.B), before = await segCount(), cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', pa.x, pa.y);
    for (let i = 1; i <= 12; i++) await touch('touchMove', pa.x + (pb.x - pa.x) * i / 12, pa.y + (pb.y - pa.y) * i / 12);
    await page.waitForTimeout(250);
    const mid = await state();
    check(mid.dragging && mid.route === 1 && mid.legs.length === 2 && mid.block === '', `${TAG}: a finger down and dragging: the ghost is up`, `route ${mid.route}, dragging ${mid.dragging}, legs ${mid.legs.length} ${mid.block}`);
    await touch('touchEnd');
    await page.waitForTimeout(600);
    const after = await state(), tt = await lastToasts();
    check(after.route === 0 && (await segCount()) > before && /^Built /.test(tt[tt.length - 1] ?? ''), `${TAG}: lifting the finger builds it`, tt[tt.length - 1] ?? '');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.detach().catch(() => {});
  }

  // ------------------------------------------------------------------ 6. the default again after a reload, with Q left on 90
  console.log('== after a reload');
  await page.evaluate(() => { window.__game.bendMode = 90; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (JAM) {
    await page.locator('[data-testid="title-card"]').waitFor({ timeout: 180000 });
    const cont = page.locator('[data-testid="title-continue"]'); if (await cont.count()) await cont.click(); else await page.locator('[data-testid="title-new"]').click();
  }
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 420000 });
  check((await page.evaluate(() => window.__game.bendMode)) === 45, `${TAG}: after a reload the bend is 45 again (the 90 left by Q was not remembered)`);

  // ------------------------------------------------------------------ 7. what the preview costs per pointer move
  if (BENCH) {
    console.log('== the preview per pointer move');
    if (!JAM) await armStreet(); else await armPath(null);
    const pb = await plan(26, 9);
    if (!pb.none) {
      await camAt(pb.A.x, pb.A.y, 0.3); await settle(1000);
      const res = await page.evaluate(([A]) => {
        const g = window.__game, N = 3000, offs = []; for (let i = 0; i < 97; i++) offs.push({ x: A.x - 14 + ((i * 7) % 43), y: A.y - 10 + ((i * 11) % 37) });
        /** ms per pointer move of what the draw does each frame with the ghost up (drawGroundOverlays): the legs, why not, the pieces Replace would take, the cost; the whole loop timed at once (the clock is 0.1 ms) */
        const frame = (bend, down) => {
          g.cancelRoute(); g.bendMode = bend; g.route = [A]; g.routeFrom = g.routeLast = { p: A, kind: 'grid' }; if (down) g.routeGesture.begin(0, 0);
          let sink = 0;
          const run = n => { for (let i = 0; i < n; i++) { g.hover = offs[i % offs.length]; const legs = g.previewLegs(), block = g.routeBlock(legs), cuts = g.routeCuts(legs); if (!block) sink += g.routeCost(); sink += cuts.length + legs.length; } };
          run(600); const t0 = performance.now(); run(N); const ms = (performance.now() - t0) / N; g.cancelRoute(); return { ms, sink };
        };
        const handler = down => {
          g.cancelRoute(); g.route = [A]; g.routeFrom = g.routeLast = { p: A, kind: 'grid' }; if (down) g.routeGesture.begin(0, 0);
          for (let i = 0; i < 3000; i++) g.pointerMove({ offsetX: 600 + (i % 300), offsetY: 400 + ((i * 3) % 200), buttons: 1 });
          const t0 = performance.now(); for (let i = 0; i < 30000; i++) g.pointerMove({ offsetX: 600 + (i % 300), offsetY: 400 + ((i * 3) % 200), buttons: 1 });
          const us = (performance.now() - t0) / 30000 * 1000; g.cancelRoute(); return us;
        };
        const cfg = [['hover90', 90, false], ['hover45', 45, false], ['drag45', 45, true], ['drag90', 90, true]], got = { hover90: [], hover45: [], drag45: [], drag90: [] };
        for (let r = 0; r < 5; r++) for (let k = 0; k < cfg.length; k++) { const [n, b, d] = cfg[(k + r) % cfg.length]; got[n].push(frame(b, d).ms); } // (rotated: no one configuration always goes first, cold)
        const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
        const out = {}; for (const n of Object.keys(got)) out[n] = { med: med(got[n]), min: Math.min(...got[n]), max: Math.max(...got[n]) };
        out.handlerHover = handler(false); out.handlerDrag = handler(true);
        g.bendMode = 45; g.hover = null; return out;
      }, [pb.A]);
      const f = r => `median ${(r.med * 1000).toFixed(1)} us (best ${(r.min * 1000).toFixed(1)}, worst ${(r.max * 1000).toFixed(1)} of 5 rounds of 3000 moves)`;
      console.log(`      preview per pointer move, hover at 90 degrees (the old default): ${f(res.hover90)}`);
      console.log(`      preview per pointer move, hover at 45 degrees (the new default): ${f(res.hover45)}`);
      console.log(`      preview per pointer move, mid-drag at 45 degrees:                ${f(res.drag45)}`);
      console.log(`      preview per pointer move, mid-drag at 90 degrees:                ${f(res.drag90)}`);
      console.log(`      the pointerMove handler itself: ${res.handlerHover.toFixed(3)} us with no drag, ${res.handlerDrag.toFixed(3)} us with one`);
      const us = r => (r.med * 1000).toFixed(1);
      check(res.drag45.med <= res.hover45.med * 1.1 + 0.0005 && res.drag90.med <= res.hover90.med * 1.1 + 0.0005, `${TAG}: a drag's preview costs no more per move than the hover preview at the same bend`, `45: ${us(res.hover45)} hover, ${us(res.drag45)} drag; 90: ${us(res.hover90)} hover, ${us(res.drag90)} drag (us)`);
      check(Math.max(res.hover90.med, res.hover45.med, res.drag45.med) < 0.05, `${TAG}: and under 50 us a move (0.3% of a 60 fps frame) at either bend`, `the default's change, 90 -> 45: ${us(res.hover90)} -> ${us(res.hover45)} us a move`);
    } else check(false, `${TAG}: a free spot for the benchmark`);
  }

  // ------------------------------------------------------------------ 6b. what the ghost says as the pointer crosses a line from the press (informational)
  {
    if (!JAM) await armStreet(); else await armPath(null);
    let ps = await plan(28, 28, { open: true, legs: 1 });
    if (ps.none) ps = await plan(28, 28, { legs: 1 });
    if (!ps.none) {
      await camAt(ps.A.x, ps.A.y, 0.3); await settle(600);
      const sweep = await page.evaluate(([A, B]) => {
        const g = window.__game, out = {}, sx = Math.sign(B.x - A.x), sy = Math.sign(B.y - A.y);
        for (const [name, f] of [['along a tile axis, 20 tiles out', d => ({ x: A.x + sx * 20, y: A.y + sy * d })], ['on the tile diagonal, 20 tiles out', d => ({ x: A.x + sx * (20 + d), y: A.y + sy * 20 })]]) {
          out[name] = [];
          for (let d = -4; d <= 4; d++) {
            g.cancelRoute(); g.route = [A]; g.routeFrom = g.routeLast = { p: A, kind: 'grid' }; g.hover = f(d);
            const legs = g.previewLegs(), why = g.routeBlock(legs); out[name].push(`${d >= 0 ? '+' : ''}${d}: ${legs.length} leg${legs.length === 1 ? '' : 's'}${why ? ' RED ' + why : ' ok'}`);
          }
        }
        g.cancelRoute(); g.hover = null; return out;
      }, [ps.A, ps.B]);
      for (const [k, v] of Object.entries(sweep)) console.log(`      pointer ${k}, 1 tile steps off the line: ${v.join(' | ')}`);
    }
  }

  check(errors.length === 0, `${TAG}: no console error or page error`, errors.slice(0, 3).join(' | '));
  await ctx.close();
} catch (e) {
  failed++; console.log(`FAIL  ${TAG}: the run stopped: ${String(e?.stack ?? e).split('\n').slice(0, 4).join(' / ')}`);
} finally {
  try { await browser?.close(); } catch { /* closed */ }
  try { await server?.close(); } catch { /* closed */ }
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);

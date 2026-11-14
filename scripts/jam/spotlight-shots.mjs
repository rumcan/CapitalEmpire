// J10 (#1269; the owner, 2026-11-14: "the show me button should show you whatever you need to see an cover the reset with a blur mast or somthing so it is CLEAR
// what you are showing"): looks at the Show me spotlight on the built jam page (npm run build:jam first) and measures what it costs a frame. Serves dist-jam on a free
// port, opens it in the installed Chrome (playwright-core, headless with WebGL, 1920 x 1080), starts a new game and puts the spotlight up from the tutorial's Show me
// buttons and the tips'. It checks what the ticket asks of it (the cut-out is where the target is and lets a click through, a click elsewhere or Esc ends it, the
// caption is whole on the window and clear of every cut-out, it follows the map when the camera moves and the window when it resizes) and writes the screenshots.
//   node scripts/jam/spotlight-shots.mjs [--out docs/jam-shots] [--scale 1.25] [--only 1,2,3] [--port N]      the shots and the checks
//   node scripts/jam/spotlight-shots.mjs --software                                                       with no GPU (software rendering): the blur is given up for the tint
//   node scripts/jam/spotlight-shots.mjs --perf [--rounds 4] [--secs 2.5] [--json out.json]                the frame cost, from Chrome's own trace: off, tint only, blur; the camera still and drifting
// Prints PASS / FAIL per check (exit 1 on a FAIL). Stop nothing by hand: the server and the browser are closed at the end, whatever happens.
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve('.'), OUT = 'dist-jam', SHOTS = resolve(opt('out', 'docs/jam-shots'));
if (!existsSync(resolve(ROOT, OUT, 'index.html'))) { console.error(`no ${OUT}/index.html: run npm run build:jam first`); process.exit(2); }
const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = Number(opt('port', 0)) || await freePort();
const server = await preview({ root: ROOT, logLevel: 'error', build: { outDir: OUT }, preview: { port, strictPort: true, host: '127.0.0.1' } });
const base = `http://127.0.0.1:${port}/`;
const W = 1920, H = 1080, SCALE = Number(opt('scale', 1.25));
const perf = has('perf'), only = opt('only', '') ? opt('only', '').split(',') : null;
mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const row = (result, label, note = '') => { if (result === 'FAIL') failed++; console.log(`${result.padEnd(5)} ${label}${note ? `  (${note})` : ''}`); };
const check = (ok, label, note = '') => row(ok ? 'PASS' : 'FAIL', label, note);

const errors = [];
const launch = (extra = []) => chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader', ...extra] });

/** a fresh page on a new jam game (the title card, Who are you, That's me), the clock stopped unless run is set; scale: Settings' Text size; reducedMotion: the player's setting */
async function newGame(browser, { scale = 1, run = false, reducedMotion = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: false, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(s => { try { localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase?.('ce'); if (s !== 1) localStorage.setItem('capitalempire.uiScale', String(s)); } catch { /* none */ } }, scale);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('[data-testid="title-card"]').waitFor({ timeout: 120000 });
  await page.locator('[data-testid="title-new"]').click(); await page.waitForTimeout(1500);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  const who = page.locator('button', { hasText: "That's me" });
  await who.waitFor({ timeout: 60000 });
  await page.locator('input[placeholder="Your name"]').fill('Spot Light').catch(() => {});
  for (const w of ['Desert', 'Autumn']) { const b = page.locator('button', { hasText: w }).first(); if (await b.isVisible().catch(() => false)) await b.click().catch(() => {}); }
  await who.click(); await page.waitForTimeout(1500);
  if (!run) await page.evaluate(() => window.__game.setSpeed(0));
  await page.locator('[data-testid="tour"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

/** what the spotlight shows now: its state, the cut-outs (the rings' boxes), the caption's box and side, the layer's clip path */
const spotInfo = page => page.evaluate(() => {
  const L = document.querySelector('[data-testid="spotlight"]'), C = document.querySelector('[data-testid="spotlight-caption"]');
  if (!L || !C) return null;
  const box = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  return {
    on: L.dataset.on, blur: L.dataset.blur, clip: L.style.clipPath, cap: box(C), side: C.dataset.side, title: C.querySelector('.spot-cap-title')?.textContent ?? '',
    holes: [...document.querySelectorAll('[data-testid="spotlight-ring"]')].filter(r => r.style.display !== 'none').map(box),
    live: document.querySelector('[data-testid="spotlight-live"]')?.textContent ?? '',
    focus: document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '',
  };
});
const waitSpot = (page, ms = 5000) => page.waitForFunction(() => document.querySelector('[data-testid="spotlight"]')?.dataset.on === '1', null, { timeout: ms }).then(() => true, () => false);
const gone = async page => (await page.locator('[data-testid="spotlight"]').count()) === 0;
const overlap = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
/** the first cut-out (a map target) stands clear of the cards docked at the right and the bottom: it is framed in the free part of the map, not under them */
async function clearOfCards(page, s, name) {
  const cards = await page.evaluate(() => ['tour', 'range-card', 'tips', 'bank-panel'].map(t => { const e = document.querySelector(`[data-testid="${t}"]`); if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 ? { id: t, x: b.x, y: b.y, w: b.width, h: b.height } : null; }).filter(Boolean));
  const h = s.holes[0], hit = cards.filter(c => overlap(h, c));
  check(!hit.length, `${name}: the map cut-out stands clear of the docked cards`, hit.length ? `over ${hit.map(c => `${c.id} ${Math.round(c.x)},${Math.round(c.y)}`).join(', ')}` : `${cards.length} cards, cut-out ${Math.round(h.x)},${Math.round(h.y)} ${Math.round(h.w)}x${Math.round(h.h)}`);
}

/** the checks every spotlight must pass: up, lit, its caption whole on the window and clear of every cut-out, read out; returns its info */
async function looks(page, name, o = {}) {
  const up = await waitSpot(page); check(up, `${name}: the spotlight comes up`);
  if (!up) return null;
  await page.waitForTimeout(o.settle ?? 900); // (the camera eases to a map target, the card opens)
  const s = await spotInfo(page); if (!s) { check(false, `${name}: the spotlight is there`); return null; }
  if (o.blur !== false) check(s.blur === 'on', `${name}: the rest is blurred`, `data-blur ${s.blur}`);
  check(s.holes.length > 0, `${name}: ${s.holes.length} cut-out(s)`, s.holes.map(h => `${Math.round(h.x)},${Math.round(h.y)} ${Math.round(h.w)}x${Math.round(h.h)}`).join(' | '));
  const c = s.cap;
  check(c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.h <= H, `${name}: the caption is whole on the window`, `${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.w)}x${Math.round(c.h)}, ${s.side}`);
  check(!s.holes.some(h => overlap(c, h)), `${name}: the caption covers no cut-out`);
  check(s.live.includes(s.title) && s.live.length > s.title.length + 10, `${name}: the caption is read out`, s.live.slice(0, 80));
  return s;
}
const shot = async (page, file) => { await page.screenshot({ path: resolve(SHOTS, file), type: 'jpeg', quality: 80 }); console.log(`      wrote ${file}`); };
const esc = async page => { await page.keyboard.press('Escape'); await page.waitForTimeout(250); };
const want = n => !only || only.includes(String(n));

// ---------------------------------------------------------------- the shots and the checks
async function shots() {
  const browser = await launch();
  try {
    console.log(`spotlight shots: ${base} (Chrome ${browser.version()}), ${W}x${H}`);
    // ---- 100% text: the tutorial's three steps
    const { ctx, page } = await newGame(browser);
    const tour = '[data-testid="tour"]', show = () => page.locator('[data-testid="tour-show"]').first(), next = () => page.locator('[data-testid="tour-next"]').first();
    await page.evaluate(() => { const g = window.__game; g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await page.waitForTimeout(400);

    // step 1: the range for sale: a map target (the range on the map) and the card's Buy row
    await show().click();
    let s = await looks(page, 'step 1 (a map target and a control)', { settle: 2600 });
    if (s) await clearOfCards(page, s, 'step 1');
    if (s && want(1)) await shot(page, 'j10-1-range-map.jpg');
    if (s) {
      check(s.holes.length >= 2 || s.holes.some(h => h.w > 300), 'step 1: the map target is a wide cut-out', s.holes.map(h => `${Math.round(h.w)}x${Math.round(h.h)}`).join(' '));
      // it follows the map: the camera moves, the cut-out moves with it
      const before = s.clip; await page.evaluate(() => { const g = window.__game; g.cam.X += 260; g.cam.Y += 90; g.emit?.(); }); await page.waitForTimeout(500);
      const after = await spotInfo(page); check(!!after && after.clip !== before, 'step 1: the cut-out follows the map when the camera moves');
      // and the window: a resize puts the layer, the cut-out and the caption right again
      await page.setViewportSize({ width: 1500, height: 900 }); await page.waitForTimeout(500);
      const small = await spotInfo(page); check(!!small && small.clip !== after?.clip && small.cap.x + small.cap.w <= 1500 && small.cap.y + small.cap.h <= 900, 'step 1: it follows a resize (the caption stays whole)');
      await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(400);
      await esc(page); check(await gone(page), 'step 1: Esc ends it');
    }
    // a click anywhere else ends it and does nothing else: it lands on the layer, not on the card below
    await show().click(); await waitSpot(page); await page.waitForTimeout(600);
    const cardsBefore = await page.evaluate(() => ({ panel: window.__game.panel, tool: window.__game.tool, money: window.__game.money }));
    await page.mouse.click(700, 980); await page.waitForTimeout(300);
    const cardsAfter = await page.evaluate(() => ({ panel: window.__game.panel, tool: window.__game.tool, money: window.__game.money }));
    check(await gone(page) && JSON.stringify(cardsBefore) === JSON.stringify(cardsAfter), 'step 1: a click anywhere ends it and does nothing else');

    // step 2: the Bank, a panel against the right edge: the caption flips to its left
    await next().click(); await page.waitForTimeout(900);
    await page.evaluate(() => { const g = window.__game; if (g.panel === 'bank') g.toggleMoneyPanel(); g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await page.waitForTimeout(400);
    await show().click();
    s = await looks(page, 'step 2 (the Bank at the right edge)', { settle: 1200 });
    if (s && want(2)) await shot(page, 'j10-2-bank-right-edge.jpg');
    if (s) check(s.side === 'left', 'step 2: the caption stands to the left of a panel at the right edge', s.side);
    await esc(page);
    await page.evaluate(() => { const g = window.__game; if (g.panel === 'bank') g.toggleMoneyPanel(); }); await page.waitForTimeout(300);

    // step 3: the Build button at the left edge (a UI target), then the player does the thing through the cut-out
    await next().click(); await page.waitForTimeout(900);
    await page.evaluate(() => { const g = window.__game; g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await page.waitForTimeout(400);
    await show().click();
    s = await looks(page, 'step 3 (the Build button at the left edge)', { settle: 900 });
    if (s && want(3)) await shot(page, 'j10-3-build-left-edge.jpg');
    if (s) {
      check(s.side === 'right', 'step 3: the caption stands to the right of a control at the left edge', s.side);
      check(s.focus === '' || /build|BUTTON/i.test(s.focus), 'step 3: focus went to the target (no trap)', s.focus);
      const h = s.holes[0], cx = h.x + h.w / 2, cy = h.y + h.h / 2;
      await page.mouse.click(cx, cy); await page.waitForTimeout(700);
      check(await gone(page), 'step 3: a click on the target through its cut-out ends the spotlight');
      check(await page.locator('[data-testid="build-menu"]').isVisible().catch(() => false), 'step 3: and the click reached the target (the Build menu opened)');
      await page.locator('[data-testid="build-close"]').click({ timeout: 800 }).catch(() => {});
    }

    // ---- the tips: Build > Tips > Show me on the balls (a map target before any ball is out falls back to the range card's ball room) and Build
    await page.evaluate(() => { const g = window.__game; g.guideAnchor = null; g.openRangeCard(false); g.panel = null; g.emit(); });
    await page.locator('[data-rail="build"]').click().catch(() => {}); await page.locator('[data-testid="build-menu"]').waitFor({ timeout: 4000 }).catch(() => {});
    await page.locator('[data-testid="build-tips"]').click().catch(() => {}); await page.waitForTimeout(500);
    for (const id of ['tip-balls', 'tip-build', 'tip-bank']) {
      const head = page.locator(`[data-testid="tips-${id}"] button[aria-expanded]`).first();
      if (!(await head.isVisible().catch(() => false))) { check(false, `tips: ${id} is on the card`); continue; }
      if (await head.getAttribute('aria-expanded') !== 'true') await head.click();
      await page.locator(`[data-testid="tips-show-${id}"]`).click();
      const t = await looks(page, `tips: ${id}`, { settle: 1200 });
      if (t && id === 'tip-balls' && want(4)) await shot(page, 'j10-4-tip-balls.jpg');
      await esc(page);
      // (the Build tip shuts the tips card, the Bank tip opens the Bank over it: put the card back for the next)
      await page.evaluate(() => { const g = window.__game; if (g.panel === 'bank') g.toggleMoneyPanel(); g.openRangeCard(false); g.emit(); }); await page.waitForTimeout(300);
      if (!(await page.locator('[data-testid="tips"]').isVisible().catch(() => false))) {
        await page.locator('[data-testid="build-close"]').click({ timeout: 500 }).catch(() => {});
        if (!(await page.locator('[data-testid="build-menu"]').isVisible().catch(() => false))) await page.locator('[data-rail="build"]').click();
        await page.locator('[data-testid="build-tips"]').click().catch(() => {}); await page.waitForTimeout(400);
      }
    }
    // ---- the balls tip with balls lying out on the range (their place on the map is faked): the camera goes to them and the Walk control is lit beside them
    await page.evaluate(() => {
      const g = window.__game, sc = g.range.scene, b = g.golf?.range; if (!sc || !b?.balls) return;
      b.total.golfers = Math.max(b.total.golfers, 5); b.balls.field = [];
      for (let i = 0; i < 60; i++) { const d = 25 + (i % 8) * 4, a = (i - 30) * 0.8; b.balls.field.push(sc.counter.x + sc.rangeSide.x * d + sc.roadDir.x * a, sc.counter.y + sc.rangeSide.y * d + sc.roadDir.y * a); }
      g.guideAnchor = null; g.openRangeCard(false); g.panel = null; g.emit();
    });
    if (!(await page.locator('[data-testid="tips"]').isVisible().catch(() => false))) {
      await page.locator('[data-testid="build-close"]').click({ timeout: 500 }).catch(() => {});
      if (!(await page.locator('[data-testid="build-menu"]').isVisible().catch(() => false))) await page.locator('[data-rail="build"]').click();
      await page.locator('[data-testid="build-tips"]').click().catch(() => {}); await page.waitForTimeout(500);
    }
    const bh = page.locator('[data-testid="tips-tip-balls"] button[aria-expanded]').first();
    if (await bh.isVisible().catch(() => false)) {
      if (await bh.getAttribute('aria-expanded') !== 'true') await bh.click();
      await page.locator('[data-testid="tips-show-tip-balls"]').click();
      const t = await looks(page, 'tips: tip-balls with balls out', { settle: 1500 });
      if (t) {
        check(t.holes.length === 2, 'tips: tip-balls with balls out: the balls on the map and the Walk control', t.holes.map(h => `${Math.round(h.w)}x${Math.round(h.h)}`).join(' '));
        await clearOfCards(page, t, 'tips: tip-balls with balls out');
        // (no screenshot: the balls here are faked in the save's list and the field draws none of them)
      }
      await esc(page);
    } else check(false, 'tips: the balls tip is on the card');
    await ctx.close();

    // ---- reduced motion: no blur (a plain darker tint), no glow animation, the camera jumps
    if (want(5)) {
      const rm = await newGame(browser, { reducedMotion: true });
      await rm.page.evaluate(() => { const g = window.__game; g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await rm.page.waitForTimeout(400);
      await rm.page.locator('[data-testid="tour-show"]').first().click();
      const r = await looks(rm.page, 'reduced motion: step 1', { settle: 900, blur: false });
      if (r) {
        const css = await rm.page.evaluate(() => { const L = document.querySelector('[data-testid="spotlight"]'), R = document.querySelector('[data-testid="spotlight-ring"]'); return { bd: getComputedStyle(L).backdropFilter, ring: getComputedStyle(R).animationName }; });
        check(r.blur === 'off' && css.bd === 'none', 'reduced motion: a plain darker tint, no blur', `data-blur ${r.blur}, backdrop-filter ${css.bd}`);
        check(css.ring === 'none', 'reduced motion: the ring does not breathe', css.ring);
        await shot(rm.page, 'j10-5-reduced-motion-tint.jpg');
      }
      await esc(rm.page); await rm.ctx.close();
    }

    // ---- the largest Text size (125%): the captions and the cut-outs scale and stay whole
    if (want(6)) {
      const big = await newGame(browser, { scale: SCALE });
      const bs = () => big.page.locator('[data-testid="tour-show"]').first(), bn = () => big.page.locator('[data-testid="tour-next"]').first();
      await big.page.evaluate(() => { const g = window.__game; g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await big.page.waitForTimeout(400);
      await bs().click();
      const a = await looks(big.page, `text ${Math.round(SCALE * 100)}%: step 1`, { settle: 2600 });
      if (a) { await clearOfCards(big.page, a, `text ${Math.round(SCALE * 100)}%: step 1`); await shot(big.page, 'j10-6-text-125.jpg'); check(a.cap.w > 330, `text ${Math.round(SCALE * 100)}%: the caption is wider than at 100%`, `${Math.round(a.cap.w)} px`); }
      await esc(big.page);
      await bn().click(); await big.page.waitForTimeout(900);
      await big.page.evaluate(() => { const g = window.__game; if (g.panel === 'bank') g.toggleMoneyPanel(); g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await big.page.waitForTimeout(400);
      await bs().click(); await looks(big.page, `text ${Math.round(SCALE * 100)}%: step 2 (the Bank)`, { settle: 1200 }); await shot(big.page, 'j10-7-text-125-bank.jpg'); await esc(big.page);
      await big.page.evaluate(() => { const g = window.__game; if (g.panel === 'bank') g.toggleMoneyPanel(); }); await big.page.waitForTimeout(300);
      await bn().click(); await big.page.waitForTimeout(900);
      await big.page.evaluate(() => { const g = window.__game; g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await big.page.waitForTimeout(400);
      await bs().click(); await looks(big.page, `text ${Math.round(SCALE * 100)}%: step 3 (Build)`, { settle: 900 }); await esc(big.page);
      await big.ctx.close();
    }
  } finally { await browser.close(); }
}

// ---------------------------------------------------------------- what it costs a frame
// The page's frames are made in three places, and the spotlight touches all three, so each is read from Chrome's own trace (headless Chrome with the GPU, 1920 x 1080, vsync on,
// the game running, the spotlight up on step 1: the range on the map and the card's Buy row): the display compositor's draw of a frame (viz Display::DrawAndSwap: the blur,
// the mask and the layer's composite are all in it), the GPU process's main thread (the commands it ran for the page: the WebGL map, the raster, the compositor's own), and the
// page's main thread (cc ProxyMain::BeginMainFrame: the game's frame and the spotlight's one requestAnimationFrame reader are in it). States are taken by turns, round after round, so a
// drift on the machine does not look like a cost: off (no spotlight), tint (the layer, its cut-out and ring, a plain dark tint: no blur) and blur (the layer as the player sees it),
// each with the camera still and drifting (the map changing every frame under the layer, and the cut-out following it).
const CATEGORIES = ['viz', 'gpu', 'benchmark', 'devtools.timeline', 'disabled-by-default-gpu.service'];
/** the camera drifting to and fro in the page until driftStop: the map changes every frame under the layer, and a map target's cut-out follows it */
const drift = page => page.evaluate(() => { const g = window.__game, cx = g.cam.X, cy = g.cam.Y; let on = true, t0 = 0; const f = t => { if (!on) return; if (!t0) t0 = t; g.cam.X = cx + Math.sin((t - t0) / 700) * 220; g.cam.Y = cy + Math.cos((t - t0) / 900) * 120; requestAnimationFrame(f); }; requestAnimationFrame(f); window.__driftStop = () => { on = false; g.cam.X = cx; g.cam.Y = cy; }; });
const driftStop = page => page.evaluate(() => window.__driftStop?.());
/** the per-frame costs (ms) in a Chrome trace: frames drawn, the compositor's draw, the GPU process's main thread, the page's main-thread frame and the animation frame callbacks in it */
function analyze(trace) {
  const threads = new Map(), tot = {}, cnt = {};
  for (const e of trace.traceEvents) if (e.ph === 'M' && e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args.name);
  const add = (k, d) => { tot[k] = (tot[k] ?? 0) + d; cnt[k] = (cnt[k] ?? 0) + 1; };
  for (const e of trace.traceEvents) {
    if (e.ph !== 'X' || !e.dur) continue;
    const th = threads.get(`${e.pid}:${e.tid}`) ?? '';
    if (e.name === 'Display::DrawAndSwap') add('draw', e.dur);
    else if (e.name === 'GpuChannel::ExecuteDeferredRequest' && th === 'CrGpuMain') add('gpu', e.dur);
    else if (e.name === 'ProxyMain::BeginMainFrame' && th === 'CrRendererMain') add('main', e.dur);
    else if (e.name === 'FireAnimationFrame' && th === 'CrRendererMain') add('raf', e.dur);
  }
  const frames = cnt.draw ?? 0, per = (k, n) => (tot[k] ?? 0) / 1000 / Math.max(1, n);
  return { frames, drawMs: per('draw', frames), gpuMs: per('gpu', frames), mainMs: per('main', cnt.main ?? 0), rafMs: per('raf', cnt.main ?? 0) };
}
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function perfRun() {
  const rounds = Number(opt('rounds', 4)), secs = Number(opt('secs', 2.5)) * 1000;
  const browser = await launch();
  const result = { size: `${W}x${H}`, chrome: browser.version(), rounds, secs: secs / 1000, states: {} };
  try {
    console.log(`spotlight cost: ${base} (Chrome ${browser.version()}), ${W}x${H}, vsync on, ${rounds} rounds of ${secs / 1000} s a state, traced`);
    const { ctx, page } = await newGame(browser, { run: true });
    await page.evaluate(() => { const g = window.__game; g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await page.waitForTimeout(500);
    const put = async on => { // the spotlight on step 1 (the range on the map and the Buy row), or put away
      if (!on) { await esc(page); if (!(await gone(page))) await page.mouse.click(700, 980); await page.waitForTimeout(400); return; }
      await page.locator('[data-testid="tour-show"]').first().click(); await waitSpot(page); await page.waitForTimeout(1800);
    };
    const setBlur = v => page.evaluate(v => { const L = document.querySelector('[data-testid="spotlight"]'); if (L) L.dataset.blur = v; }, v);
    const states = [
      ['off', async () => { await put(false); }, false],
      ['tint', async () => { await put(false); await put(true); await setBlur('off'); }, false],
      ['blur', async () => { await put(false); await put(true); await setBlur('on'); }, false],
      ['off, camera drifting', async () => { await put(false); }, true],
      ['tint, camera drifting', async () => { await put(false); await put(true); await setBlur('off'); }, true],
      ['blur, camera drifting', async () => { await put(false); await put(true); await setBlur('on'); }, true],
    ];
    for (const [name] of states) result.states[name] = { frames: [], drawMs: [], gpuMs: [], mainMs: [], rafMs: [] };
    for (let r = 0; r < rounds; r++) {
      for (const [name, setup, move] of states) {
        await setup(); if (move) await drift(page);
        await page.waitForTimeout(800); // (a short warm-up: the first frames with a layer pay for its shaders)
        await browser.startTracing(page, { categories: CATEGORIES });
        await page.waitForTimeout(secs);
        const a = analyze(JSON.parse((await browser.stopTracing()).toString()));
        if (move) await driftStop(page);
        const S = result.states[name]; for (const k of Object.keys(S)) S[k].push(a[k]);
        console.log(`  round ${r + 1} ${name.padEnd(22)} ${String(a.frames).padStart(3)} frames: compositor draw ${a.drawMs.toFixed(2)} ms, gpu thread ${a.gpuMs.toFixed(2)} ms, page frame ${a.mainMs.toFixed(2)} ms (animation frame callbacks ${a.rafMs.toFixed(2)} ms)`);
      }
    }
    await put(false);
    console.log('\nmedian over the rounds (min .. max), ms a frame\nstate                   frames   compositor draw        gpu process thread     page main-thread frame   animation frame callbacks');
    const f = a => `${median(a).toFixed(2).padStart(5)} (${Math.min(...a).toFixed(2)}..${Math.max(...a).toFixed(2)})`.padEnd(21);
    for (const [name, S] of Object.entries(result.states)) { S.med = { frames: median(S.frames), drawMs: median(S.drawMs), gpuMs: median(S.gpuMs), mainMs: median(S.mainMs), rafMs: median(S.rafMs) }; console.log(`${name.padEnd(23)} ${String(median(S.frames)).padStart(5)}   ${f(S.drawMs)}  ${f(S.gpuMs)}  ${f(S.mainMs)}    ${f(S.rafMs)}`); }
    const d = (a, b, k) => result.states[a].med[k] - result.states[b].med[k];
    result.cost = {};
    for (const [label, on, off] of [['tint', 'tint', 'off'], ['blur', 'blur', 'off'], ['blur over tint', 'blur', 'tint'], ['tint, drifting', 'tint, camera drifting', 'off, camera drifting'], ['blur, drifting', 'blur, camera drifting', 'off, camera drifting']]) {
      const c = result.cost[label] = { drawMs: d(on, off, 'drawMs'), gpuMs: d(on, off, 'gpuMs'), mainMs: d(on, off, 'mainMs') };
      console.log(`cost of ${label.padEnd(16)} compositor draw ${c.drawMs >= 0 ? '+' : ''}${c.drawMs.toFixed(2)} ms, gpu thread ${c.gpuMs >= 0 ? '+' : ''}${c.gpuMs.toFixed(2)} ms, page main thread ${c.mainMs >= 0 ? '+' : ''}${c.mainMs.toFixed(2)} ms`);
    }
    writeFileSync(resolve(opt('json', 'output/spotlight-perf.json')), JSON.stringify(result, null, 1));
    await ctx.close();
  } finally { await browser.close(); }
}

// ---------------------------------------------------------------- a machine with no GPU: the blur gives way to the plain tint
// Chrome drawing everything in software (SwiftShader): frames come slow, so the blur (judged on the first frames it is up: Spotlight.tsx SLOW_MS) is dropped for the plain tint, in that
// Show me and the ones after it
async function softwareRun() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    console.log(`spotlight without a GPU: ${base} (Chrome ${browser.version()}), ${W}x${H}, software rendering`);
    const { ctx, page } = await newGame(browser, { run: true });
    await page.evaluate(() => { const g = window.__game; g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await page.waitForTimeout(500);
    const cadence = () => page.evaluate(() => new Promise(res => { const d = []; let prev = 0; const f = t => { if (prev) d.push(t - prev); prev = t; if (d.length < 12) requestAnimationFrame(f); else res(d.reduce((a, b) => a + b, 0) / d.length); }; requestAnimationFrame(f); }));
    check((await cadence()) > 20, 'software rendering: the page is slow without the spotlight too', `${Math.round(await cadence())} ms a frame`);
    for (let k = 1; k <= 2; k++) {
      await page.locator('[data-testid="tour-show"]').first().click();
      const up = await waitSpot(page, 20000); check(up, `software rendering: Show me ${k}: the spotlight comes up`);
      const off = await page.waitForFunction(() => document.querySelector('[data-testid="spotlight"]')?.dataset.blur === 'off', null, { timeout: 15000 }).then(() => true, () => false);
      check(off, `software rendering: Show me ${k}: the blur is given up for the plain tint`, off ? '' : 'still blurred after 15 s');
      await esc(page); await page.waitForTimeout(400);
      if (!(await gone(page))) await page.mouse.click(700, 980);
    }
    await ctx.close();
  } finally { await browser.close(); }
}

try {
  if (has('software')) await softwareRun(); else if (perf) await perfRun(); else await shots();
  if (errors.length) { row('FAIL', 'console errors', errors.slice(0, 5).join(' / ')); }
} catch (e) { console.error(e); failed++; }
finally { await new Promise(r => server.httpServer.close(() => r())); }
process.exit(failed ? 1 : 0);

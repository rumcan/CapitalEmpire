// #1296 (the owner, 2026-11-14, of the normal game's Holes: "I built my first hole but it never rendered", "clicking on plan a hole does nothing", "the window should be
// overflow visible", "add trees to the paint hole 1 list at nr 9", "WE need alot more testing"; and of Play: "it started up the wrong golf game ... it should be the
// cinderlinks one"): the HOLES PLAY-THROUGH. A headless run of the real game that plays what a player does, with real clicks on the map and real clicks in the panels,
// and checks what comes of each step on the screen and in the game:
//   start      a new game: Who are you?, the start spot ("Pick a spot for me"), the cards put away
//   hole1      Course > Holes > New hole: a click on a tee, a click on a green, Build: the hole's ground is DRAWN (the map's pixels over the hole change, the frame loop and
//              the ground's bakes are alive), the hole is in the Holes panel
//   menu       the + beside Hole 1: its dropdown is whole (every item inside the window and under the pointer, no horizontal scrollbar) at 100% and at the largest Text
//              size; Plan a hole does something you can see (the toast, the wizard's card)
//   hole2      Plan a hole: a click on a tee, a click on a green, Build: a second hole exists and is drawn
//   paint      Edit Hole Layout on hole 1: the Paint hole 1 palette runs 1 Fairway, 2 Green, 3 Tee, 4 Rough, 5 Bunker, 6 Water, 7 Waste area, 8 Long grass, 9 Trees,
//              0 Create your own; each surface 1 to 8 painted with the brush changes the map, and so does Trees (key 9): its trees stand round the green, never on it
//   play       the hole card's Play chip: Just hole N, and All N holes, open the golf view from behind the golfer (the Cinderlinks view: its frame is up, view3pHole is
//              the hole), not the old top-down round; nothing on the screen (the page's text and every canvas's text) says "Stand In"
//   jam        (the jam build, a dev server run with VITE_JAM=1) the same first hole is drawn; the jam shows no hand shaping (no Shape by hand, More options, saved holes,
//              empty hole, Paint hole) and its + plans a hole at once
// Every step prints ok / FAIL lines; a FAIL, a console error or a page error exits 1. Screenshots of the key moments go to --out.
//   npm run holes:playthrough                      (starts its own dev server per variant on a free port; about 6 minutes)
//   node scripts/dev/holes-playthrough.mjs [--base URL [--variants jam]] [--variants normal,jam] [--seed N] [--steps start,hole1,menu,hole2,paint,play] [--out DIR]
//        [--headed] [--keep] [--cdp PORT]
//   --base      use a dev server already running (the normal game, or with --variants jam the jam build) instead of starting one
//   --seed      the old automatic start on that map (no start spot to pick); without it the real new game, a random map (it says the seed it got)
//   --cdp       attach to a Chrome kept alive on that remote-debugging port (a fresh context each run; --keep leaves it open): for working on a step
//   --reuse     with --cdp: carry on in the page the last run left open (--keep), whatever state the game is in: run the steps after the ones that made it
// One headless Chrome (the installed one, playwright-core), closed when done; the servers it started are stopped.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { createServer } from 'vite';
import { createServer as netServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve('.'), OUT = resolve(opt('out', 'output/holes-playthrough')), W = 1440, H = 900;
const variants = opt('variants', has('base') ? 'normal' : 'normal,jam').split(','), STEPS = new Set(opt('steps', 'start,hole1,menu,hole2,paint,play').split(','));
mkdirSync(OUT, { recursive: true });
const t0 = Date.now(), lap = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
let bad = 0;
const rows = [];
const check = (ok, what, note = '') => { rows.push({ ok, what }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${note ? `  (${note})` : ''}`); if (!ok) bad++; return ok; };
const freePort = () => new Promise(res => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** a dev server of this checkout on a free port (jam: VITE_JAM=1, as npm run build:jam sets it) */
async function serve(jam) {
  process.env.VITE_JAM = jam ? '1' : '';
  const port = Number(opt('port', 0)) || await freePort();
  const server = await createServer({ root: ROOT, logLevel: 'error', clearScreen: false, server: { port, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  return { server, base: `http://127.0.0.1:${port}/` };
}

// ---------------------------------------------------------------- the page's side
/** text a canvas draws or a page shows that says Stand In (the owner's rule: nothing on screen says it): installed in every frame before the game runs */
const spy = () => {
  const seen = (window.__standIn = window.__standIn || []);
  for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
    if (!C) continue;
    for (const f of ['fillText', 'strokeText']) {
      const o = C.prototype[f]; if (typeof o !== 'function') continue;
      C.prototype[f] = function (t, ...r) { try { if (/stand[ -]?in\b/i.test(String(t)) && !/stand-ins\b/i.test(String(t))) seen.push(String(t).slice(0, 80)); } catch { /* none */ } return o.call(this, t, ...r); };
    }
  }
};

async function launch(jam) {
  const browser = has('cdp')
    ? await chromium.connectOverCDP(`http://127.0.0.1:${opt('cdp', '9333')}`)
    : await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
  const ctx = has('reuse') ? browser.contexts().at(-1) : await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: false });
  if (!has('reuse')) await ctx.addInitScript(spy);
  const page = has('reuse') ? ctx.pages().at(-1) : await ctx.newPage();
  if (has('reuse')) { await page.setViewportSize({ width: W, height: H }); await page.evaluate(spy); }
  const errors = [];
  const quiet = t => /favicon|Failed to load resource|ResizeObserver loop/.test(t);
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !quiet(t)) errors.push(`console: ${t.slice(0, 240)}`); });
  page.on('worker', w => { try { w.on('console', m => { const t = m.text(); if (m.type() === 'error' && !quiet(t)) errors.push(`worker: ${t.slice(0, 240)}`); }); } catch { /* an older Playwright has no worker console */ } });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  return { browser, ctx, page, errors, jam };
}

const G = {
  /** runs fn in the page with the game as its first argument */
  run: (page, fn, arg) => page.evaluate(([f, a]) => (0, eval)(`(${f})`)(window.__game, a), [fn.toString(), arg]),
};
const game = (page, fn, arg) => G.run(page, fn, arg);
const settle = async (page, ms = 700) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => lap('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const still = page => page.waitForFunction(() => { const g = window.__game, c = [g.cam.X, g.cam.Y, g.cam.z].join(); const r = window.__camlast === c; window.__camlast = c; return r && !g.camEase; }, null, { timeout: 20000, polling: 300 }).catch(() => lap('  (the camera kept moving)'));
const shot = async (page, name) => { const f = join(OUT, `${name}.jpg`); await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 82, mozjpeg: true }).toFile(f); console.log(`  shot ${f}`); };
/** the map alone (the UI layer hidden), as raw RGB */
async function mapPixels(page) {
  const h = await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: 'png' });
  await h.evaluate(e => e.remove());
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
/** the share of the box's pixels (css px: x0 y0 x1 y1) that differ between two map pictures by more than a clear step */
function changed(a, b, box, step = 60) {
  const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1])), x1 = Math.min(a.w, Math.ceil(box[2])), y1 = Math.min(a.h, Math.ceil(box[3]));
  let n = 0, d = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * a.w + x) * a.ch; n++; if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > step) d++; }
  return n ? d / n : 0;
}
/** the screen (css px) of world tile p */
const scr = (page, p) => page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [p.x, p.y]);
const look = (page, p, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z ?? g.cam.z); g.emit(); }, [p.x, p.y, z ?? null]);
/** a real click on world tile p: the camera brings it to the middle when something covers it or it is off the map, the pointer moves there and presses */
async function clickMap(page, p, z) {
  const free = s => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS' && x > 4 && y > 4 && x < innerWidth - 4 && y < innerHeight - 4; }, [s.x, s.y]);
  let s = await scr(page, p);
  if (!(await free(s))) { await look(page, p, z); await page.waitForTimeout(300); s = await scr(page, p); }
  if (!(await free(s))) return false;
  await page.mouse.move(s.x - 14, s.y - 9); await page.mouse.move(s.x, s.y, { steps: 4 }); await page.waitForTimeout(220);
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
  return true;
}
/** text that says Stand In on the page now (its words, its pictures' titles and alts, and the golf view's frame) and what the canvases drew since the page began */
const standIn = page => page.evaluate(() => {
  const out = [], re = /stand in\b/i, scan = (doc, tag) => {
    const txt = (doc.body?.innerText ?? ''), at = txt.search(re); if (at >= 0) out.push(`${tag} text: "${txt.slice(Math.max(0, at - 30), at + 40).replace(/\s+/g, ' ')}"`);
    for (const e of doc.querySelectorAll('[title],[aria-label],[alt],[placeholder]')) for (const a of ['title', 'aria-label', 'alt', 'placeholder']) { const v = e.getAttribute(a); if (v && re.test(v)) out.push(`${tag} ${a}: ${v.slice(0, 50)}`); }
  };
  scan(document, 'page');
  for (const f of document.querySelectorAll('iframe')) { try { if (f.contentDocument) scan(f.contentDocument, 'frame'); } catch { /* another origin */ } }
  return [...out, ...(window.__standIn ?? []).map(t => `canvas: ${t}`), ...[...document.querySelectorAll('iframe')].flatMap(f => { try { return (f.contentWindow.__standIn ?? []).map(t => `frame canvas: ${t}`); } catch { return []; } })];
});
const noStandIn = async (page, where) => { const s = await standIn(page); check(s.length === 0, `nothing says Stand In ${where}`, s.slice(0, 3).join(' | ')); };

/** the world's tile pairs the New hole wizard takes (its own check: ok, nothing left out, no warning but the trees), nearest the spot first; avoid: tile points a hole must keep away from */
const findHole = (page, near, len = 75) => page.evaluate(([near, len]) => {
  const g = window.__game, w = g.paint.wizard, far = () => ({ x: 1e9, y: 1e9 }), was = g.paint.planOpen; g.setTool('course'); g.paint.setPlan();
  const cand = [];
  for (let ux = -170; ux <= 230; ux += 10) for (let vy = -170; vy <= 330; vy += 10) cand.push({ x: near.x + ux - 30, y: near.y + vy - 60 });
  cand.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
  let best = null, soft = null;
  for (const t of cand) {
    for (const [dx, dy] of [[0, len], [0, -len], [len, 0], [-len, 0]]) {
      w.start(w.hole); w.press(t, -1e5, -1e5, far); if (w.step !== 'green') continue;
      w.press({ x: t.x + dx, y: t.y + dy }, -1e5, -1e5, far); if (w.step !== 'shape') continue;
      const c = w.check(); if (!c.ok || !c.ghost) continue;
      const warns = w.checks().filter(k => k.kind === 'warn' && !/tree/i.test(k.text)).length, pair = { tee: t, green: { x: t.x + dx, y: t.y + dy }, par: c.ghost.info.par, cost: c.ghost.cost, left: c.ghost.refused || 0 };
      if (!warns && !pair.left) { best = pair; break; }
      if (!soft && !warns) soft = pair;
    }
    if (best) break;
  }
  w.start(w.hole); g.setTool('select'); g.emit();
  return best ?? soft;
}, [near, len]);

/** the Holes panel's state, as the checks read it */
const holesState = page => page.evaluate(() => {
  const g = window.__game, p = g.paint, gr = g.courseGrid; let cells = 0; if (gr) for (let k = 0; k < gr.surf.length; k++) if (gr.hole[k]) cells++;
  return { built: g.courseHoleViews().filter(v => v.started).map(v => `${v.n}:par${v.par}:${v.lengthM}m`), cells, planOpen: p.planOpen, step: p.wizard.step, hole: p.wizard.hole, mode: p.mode, edit: p.editingHole, trees: p.treesInHand, frames: g.perf.frames, view3p: g.view3pHole, busy: g.ground.busy, job: !!g.cgJob, toasts: g.toasts.map(t => t.text ?? t.msg ?? '') };
});
/** the frame loop and the ground are alive: frames pass, no golf view holds the map, no chunk bake is left in flight */
async function alive(page, what) {
  const a = (await holesState(page)).frames; await page.waitForTimeout(1200); const s = await holesState(page);
  check(s.frames - a > 20 && s.view3p === null, `${what}: the frame loop runs (${s.frames - a} frames in 1.2 s)`);
  await settle(page, 300);
  const e = await holesState(page); check(e.busy === 0 && !e.job, `${what}: no ground bake is left in flight (busy ${e.busy}, course job ${e.job})`);
}

// ---------------------------------------------------------------- the steps
/** a new game to the first move: the title card (jam), Who are you?, the start spot, the cards put away */
async function start(S) {
  const { page, jam } = S;
  const q = opt('seed', ''), url = S.base + (q && !jam ? `?start=range&seed=${q}` : '');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
  if (jam) { await page.locator('[data-testid="title-card"]').waitFor({ timeout: 240000 }); await page.locator('[data-testid="title-new"]').click(); await sleep(1200); }
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.waitForFunction(() => window.__game.firstViewBaked, null, { timeout: 180000 }).catch(() => lap('  (the first view never counted as baked)'));
  await sleep(1500);
  const who = page.locator('[data-testid="who-go"]'); await who.waitFor({ timeout: 90000 });
  await page.locator('[data-testid="who-name"]').fill('Playthrough').catch(() => {});
  await who.click(); await sleep(1500);
  if (await page.locator('[data-testid="start-pick-card"]').count()) {
    await sleep(1200); await page.locator('[data-testid="start-pick-auto"]').click();
    await page.waitForFunction(() => window.__game.golf?.range?.home && !window.__game.startPick, null, { timeout: 90000 });
    await sleep(2500);
  }
  check(await page.evaluate(() => !!window.__game.golf?.range?.home), 'a new game has begun: the range start is laid', `seed ${await page.evaluate(() => window.__game.seed ?? window.__game.devSeed ?? '?')}`);
  // the cards that cover the map go: the tutorial, the welcome card
  for (let k = 0; k < 3; k++) {
    const off = page.locator('[data-testid="tour-off"]'); if (await off.count() && await off.isVisible().catch(() => false)) { await off.click().catch(() => {}); await sleep(300); }
    const wc = page.locator('[data-testid="welcome-card"] [aria-label="Close"]'); if (await wc.count()) { await wc.first().click().catch(() => {}); await sleep(300); }
  }
  await game(page, g => { window.__night = 0; g.nightAmount = () => window.__night; g.setSpeed(0); g.emit(); });
  await settle(page, 800);
}
const homeOf = page => page.evaluate(() => { const [x, y, w, d] = window.__game.golf.range.home; return { x: x + w / 2, y: y + d / 2 }; });
/** Course > Holes > New hole through the rail's flyout */
async function openNewHole(page) {
  await page.keyboard.press('Escape').catch(() => {});
  if (!(await page.locator('[data-flyout-col="0"]').count())) { await page.click('[data-rail="course"]'); await sleep(450); }
  await page.click('[data-flyout-col="0"] [data-key="holes"]'); await sleep(400);
  await page.click('[data-flyout-col="1"] [data-key*="newHole"]'); await sleep(700);
}
/** the wizard's two clicks on the map, then the plan it made */
async function plan(page, pair) {
  const mid = { x: (pair.tee.x + pair.green.x) / 2, y: (pair.tee.y + pair.green.y) / 2 };
  await look(page, mid, 0.2); await settle(page, 600);
  const t1 = await clickMap(page, pair.tee); await still(page);
  const t2 = await clickMap(page, pair.green); await sleep(400);
  const st = await game(page, g => { const w = g.paint.wizard, c = w.check(); return { step: w.step, ok: c.ok, why: c.why, cost: c.ghost?.cost, par: c.ghost?.info?.par }; });
  return { clicked: t1 && t2, ...st, mid };
}
/** Build, then the camera back on the hole with the Select tool: the map as a player sees it */
async function buildAndLook(page, mid) {
  await page.locator('.wiz-build').click(); await sleep(1500);
  await game(page, (g, m) => { g.setTool('select'); g.camEase = null; g.lookAt(m.x, m.y, 0.2); g.emit(); }, mid);
  await settle(page, 2500);
}
/** the screen box of a hole's line, grown by the corridor's width: where the ground should change */
async function holeBox(page, pair) {
  const a = await scr(page, pair.tee), b = await scr(page, pair.green), m = 90;
  return [Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m];
}
const CLEAR = [0, 0, W, H];

async function hole1(S) {
  const { page } = S;
  const home = await homeOf(page);
  S.pair1 = await findHole(page, home);
  check(!!S.pair1, 'the land has room for a first hole (a tee and a green the wizard takes)', S.pair1 ? `par ${S.pair1.par}, $${S.pair1.cost}, left out ${S.pair1.left} m2` : '');
  if (!S.pair1) throw new Error('no spot for a hole');
  const mid = { x: (S.pair1.tee.x + S.pair1.green.x) / 2, y: (S.pair1.tee.y + S.pair1.green.y) / 2 }; S.mid1 = mid;
  await look(page, mid, 0.2); await settle(page, 1200);
  const before = await mapPixels(page); S.box1 = await holeBox(page, S.pair1);
  await shot(page, `${S.tag}-01-hole1-before`);
  await openNewHole(page);
  check(await game(page, g => g.paint.planOpen && g.paint.wizard.step === 'tee'), 'Course > Holes > New hole opens the wizard on the tee');
  const pl = await plan(page, S.pair1);
  check(pl.clicked && pl.step === 'shape' && pl.ok, 'a click on a tee and a click on a green plan the hole', `${pl.step}, par ${pl.par}, $${pl.cost} ${pl.why ?? ''}`);
  await shot(page, `${S.tag}-02-hole1-planned`);
  await buildAndLook(page, mid);
  const st = await holesState(page);
  check(st.built.length === 1 && /^1:par[345]/.test(st.built[0] ?? ''), `Build: the Holes panel lists Hole 1`, st.built.join(', '));
  check(st.cells > 1500, `the hole's cells are in the course grid (${st.cells} cells of hole 1)`);
  const after = await mapPixels(page);
  const share = changed(before, after, S.box1);
  check(share > 0.25, `the hole is DRAWN on the map: ${(share * 100).toFixed(0)}% of the pixels over it changed`);
  await shot(page, `${S.tag}-03-hole1-built`);
  await alive(page, 'after the first Build');
  await noStandIn(page, 'after the first hole');
  S.holeShare1 = share;
}

/** the + menu: whole and under the pointer, at 100% and at the largest Text size */
async function menuWhole(page, scale) {
  await page.evaluate(v => document.documentElement.style.setProperty('--ui-scale', v), String(scale)); await sleep(500);
  const add = page.locator('[data-testid="hole-add"]'); await add.scrollIntoViewIfNeeded().catch(() => {}); await add.click(); await sleep(450);
  const m = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight, menu = document.querySelector('[data-testid="hole-menu"]'), panel = document.querySelector('[data-testid="tool-panel"]');
    const items = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].map(b => { const r = b.getBoundingClientRect(), pts = [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 6, r.y + 6], [r.right - 6, r.bottom - 6]]; const top = p => { const e = document.elementFromPoint(p[0], p[1]); return !!e && (e === b || b.contains(e)); }; return { t: b.textContent.slice(0, 20), inside: r.x >= 0 && r.y >= 0 && r.right <= W && r.bottom <= H, hit: pts.every(top) }; });
    const mr = menu?.getBoundingClientRect();
    return { items, menu: mr ? { l: Math.round(mr.left), t: Math.round(mr.top), r: Math.round(mr.right), b: Math.round(mr.bottom) } : null, doc: [document.documentElement.scrollWidth, document.documentElement.clientWidth], panel: panel ? [panel.scrollWidth, panel.clientWidth] : null, W, H };
  });
  check(!!m.menu && m.items.length === 3, `${scale * 100}% text: the + menu opens with its three items`, m.items.map(i => i.t).join(' | '));
  check(m.items.every(i => i.inside && i.hit), `${scale * 100}% text: every item of the menu is whole (inside the window and under the pointer, over the panel's edge if need be)`, JSON.stringify(m.menu));
  check(m.doc[0] <= m.doc[1] && (!m.panel || m.panel[0] <= m.panel[1] + 1), `${scale * 100}% text: no horizontal scrollbar (page ${m.doc.join('/')}, panel ${m.panel?.join('/')})`);
  return m;
}
async function menu(S) {
  const { page } = S;
  await openNewHole(page); // (the Holes panel with its strip)
  for (const scale of [1, 1.25]) {
    await menuWhole(page, scale);
    await shot(page, `${S.tag}-04-menu-${scale}`);
    if (scale === 1) { await page.keyboard.press('Escape'); await sleep(300); check(await page.locator('[data-testid="hole-menu"]').count() === 0, 'Esc puts the menu away'); }
  }
  // Plan a hole: something you can see happens (the wizard already waits on the next hole's tee after a Build: it used to change nothing)
  const was = await holesState(page);
  await page.locator('[data-testid="hole-menu-plan"]').click(); await sleep(900);
  const now = await holesState(page);
  check(await page.locator('[data-testid="hole-menu"]').count() === 0, 'Plan a hole puts the menu away');
  check(now.planOpen && now.step === 'tee' && now.hole === Math.max(...was.built.map(b => +b.split(':')[0])) + 1, `Plan a hole: the wizard waits on the tee of hole ${now.hole}`, `${now.step}`);
  const said = now.toasts.some(t => /New hole \d+: click a tee/.test(t));
  const card = await page.evaluate(() => { const c = document.querySelector('[data-primary="wizard"]'), p = document.querySelector('[data-testid="tool-panel"]'); if (!c || !p) return null; const a = c.getBoundingClientRect(), b = p.getBoundingClientRect(); return { top: a.top >= b.top - 1 && a.top < b.bottom - 40 }; });
  check(said && !!card?.top, 'Plan a hole shows what it did: a toast says which hole and what to click, and the wizard card is at the top of the panel', `toast ${said}, card ${JSON.stringify(card)}`);
  await page.evaluate(v => document.documentElement.style.setProperty('--ui-scale', v), '1'); await sleep(300);
  await shot(page, `${S.tag}-05-plan-a-hole`);
}

async function hole2(S) {
  const { page } = S;
  const home = await homeOf(page);
  const near = { x: (S.pair1.tee.x + S.pair1.green.x) / 2, y: (S.pair1.tee.y + S.pair1.green.y) / 2 };
  S.pair2 = await findHole(page, { x: near.x + 40, y: near.y }, 75);
  check(!!S.pair2, 'there is room for a second hole', S.pair2 ? `par ${S.pair2.par}, $${S.pair2.cost}` : 'none'); if (!S.pair2) return;
  const mid = { x: (S.pair2.tee.x + S.pair2.green.x) / 2, y: (S.pair2.tee.y + S.pair2.green.y) / 2 }; S.mid2 = mid;
  await game(page, g => { g.setTool('select'); g.emit(); });
  await look(page, mid, 0.2); await settle(page, 1200);
  const before = await mapPixels(page), box = await holeBox(page, S.pair2);
  await openNewHole(page); // (Plan a hole's own path is the menu's: this starts from the same wizard)
  await page.locator('[data-testid="hole-add"]').click(); await sleep(350); await page.locator('[data-testid="hole-menu-plan"]').click(); await sleep(600);
  const pl = await plan(page, S.pair2);
  check(pl.clicked && pl.step === 'shape' && pl.ok, 'Plan a hole: two clicks (a tee, a green) plan the second hole', `${pl.step}, par ${pl.par}, $${pl.cost} ${pl.why ?? ''}`);
  await buildAndLook(page, mid);
  const st = await holesState(page);
  check(st.built.length === 2, 'a second hole exists in the Holes panel', st.built.join(', '));
  const share = changed(before, await mapPixels(page), box);
  check(share > 0.25, `the second hole is DRAWN on the map: ${(share * 100).toFixed(0)}% of the pixels over it changed`);
  await shot(page, `${S.tag}-06-hole2-built`);
  await alive(page, 'after the second Build');
}

/** the world's free cells for the brush: round patches of bare owned land (centres, tiles) near a point, none touching a built cell, each apart */
const freePatches = (page, near, n) => page.evaluate(([near, n]) => {
  const g = window.__game, gr = g.courseGrid, out = [], R = 4;
  const at = (x, y) => { const cx = Math.floor((x - gr.x0) / 0.5), cy = Math.floor((y - gr.y0) / 0.5); return cx >= 0 && cy >= 0 && cx < gr.w && cy < gr.h ? cy * gr.w + cx : -1; };
  const cand = []; for (let dx = -90; dx <= 90; dx += 6) for (let dy = -90; dy <= 90; dy += 6) cand.push({ x: near.x + dx, y: near.y + dy });
  cand.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
  for (const c of cand) {
    if (out.some(o => Math.hypot(o.x - c.x, o.y - c.y) < 14)) continue;
    let ok = true; for (let a = 0; a < 16 && ok; a++) for (const r of [0, R / 2, R]) { const x = c.x + Math.cos(a / 16 * Math.PI * 2) * r, y = c.y + Math.sin(a / 16 * Math.PI * 2) * r, i = at(x, y); if (i < 0 || gr.surf[i] !== 0 || !g.ownedAt(x, y) || g.onRangePlot(x, y)) { ok = false; break; } }
    if (ok) out.push(c); if (out.length >= n) break;
  }
  return out;
}, [near, n]);
const surfCount = (page, id) => page.evaluate(id => { const gr = window.__game.courseGrid; let n = 0; for (let k = 0; k < gr.surf.length; k++) if (gr.surf[k] === id) n++; return n; }, id);

async function paint(S) {
  const { page } = S;
  S.mid1 ??= await game(page, g => { const p = g.golf.pins.find(q => q.hole === 1); return { x: p.x, y: p.y }; });
  // hole 1's card, then Edit Hole Layout: the editor with its Paint hole 1 palette
  await game(page, g => { g.setTool('select'); g.emit(); });
  await look(page, S.mid1, 0.2); await settle(page, 800);
  await openNewHole(page); await page.click('[data-hole="1"]'); await sleep(600);
  await page.locator('[data-testid="hole-edit"]').click(); await sleep(900);
  check(await game(page, g => g.paint.editingHole === 1), 'the hole card\'s Edit Hole Layout opens the editor on hole 1');
  const pal = await page.evaluate(() => [...document.querySelectorAll('[data-section="edit-paint"] .swatch')].map(b => `${b.querySelector('.swatch-key')?.textContent}:${b.querySelector('.swatch-name')?.textContent}`));
  const want = ['1:Fairway', '2:Green', '3:Tee', '4:Rough', '5:Bunker', '6:Water', '7:Waste area', '8:Long grass', '9:Trees', '0:Create your own'];
  check(JSON.stringify(pal) === JSON.stringify(want), 'Paint hole 1 lists 1 Fairway to 8 Long grass, 9 Trees, 0 Create your own', pal.join(' '));
  check(await page.evaluate(() => { const b = document.querySelector('[data-section="edit-paint"] [data-swatch="trees"] img'); return !!b && b.getAttribute('data-action-tile') === 'trees'; }), 'Trees wears the painted trees tile');
  await shot(page, `${S.tag}-07-paint-palette`);
  // each surface: a click on its swatch (its look shows in focus: "All surfaces" brings the swatches back), a drag of the round brush over bare land; the map and the grid change there
  const patches = await freePatches(page, S.mid1, 10);
  check(patches.length >= 9, `bare land for the brush: ${patches.length} patches`); if (patches.length < 9) return;
  const SURF = { fairway: 4, green: 8, tee: 5, rough: 1, bunker: 6, water: 3, waste: 7, longGrass: 9 };
  const names = ['fairway', 'green', 'tee', 'rough', 'bunker', 'water', 'waste', 'longGrass'];
  for (let i = 0; i < names.length; i++) {
    const kind = names[i], c = patches[i], id = SURF[kind];
    await look(page, c, 0.3); await settle(page, 500);
    const before = await mapPixels(page), n0 = await surfCount(page, id);
    const back = page.locator('[data-section="edit-paint"] [data-focus-back]'); if (await back.count()) { await back.click(); await sleep(200); }
    const sw = page.locator(`[data-section="edit-paint"] [data-swatch="${kind}"]`); if ((await sw.getAttribute('aria-pressed')) !== 'true') await sw.click(); await sleep(250);
    if (i === 0) { await page.locator('[data-section="edit-paint"] [aria-label="Brush shape"] button', { hasText: 'Round' }).click(); await sleep(200); await game(page, g => g.paint.setBrushR(3)); }
    const a = await scr(page, { x: c.x - 2.5, y: c.y }), b = await scr(page, { x: c.x + 2.5, y: c.y }), box = [Math.min(a.x, b.x) - 130, Math.min(a.y, b.y) - 100, Math.max(a.x, b.x) + 130, Math.max(a.y, b.y) + 100];
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.move(a.x, a.y + 3, { steps: 4 }); await page.mouse.up(); await sleep(400);
    await settle(page, 700);
    const n1 = await surfCount(page, id), share = changed(before, await mapPixels(page), box, 40);
    check(n1 - n0 > 20 && share > 0.01, `${i + 1} ${kind}: the brush painted it (${n1 - n0} cells, ${(share * 100).toFixed(1)}% of the pixels near it changed)`);
  }
  await shot(page, `${S.tag}-08-painted-surfaces`);
  // the keys: 9 is Trees, 0 opens Create your own
  await page.keyboard.press('Digit0'); await sleep(400);
  check(await game(page, g => !!g.paint.grassDraft), 'key 0 opens Create your own'); await game(page, g => { g.paint.closeGrass(); }); await sleep(300);
  // Trees: key 9, a drag over hole 1's green: trees stand round it, none on it
  const gc = await game(page, g => { const p = g.golf.pins.find(q => q.hole === 1); return p ? { x: p.x, y: p.y } : null; });
  await look(page, gc, 0.3); await settle(page, 600);
  await page.locator('[data-section="edit-paint"]').scrollIntoViewIfNeeded().catch(() => {});
  await page.keyboard.press('Digit9'); await sleep(400);
  check(await game(page, g => g.paint.treesInHand && g.paint.planOpen && g.paint.editingHole === 1), 'key 9 puts the Trees brush in hand, with Edit Hole Layout still open');
  check(await page.evaluate(() => document.querySelector('[data-section="edit-paint"] [data-swatch="trees"]')?.getAttribute('aria-pressed') === 'true' && !!document.querySelector('[data-testid="trees-brush"]')), 'the Trees swatch is lit and its brush controls show');
  const before = await mapPixels(page), p0 = await game(page, g => g.plantedCount());
  const ga = await scr(page, { x: gc.x - 7, y: gc.y }), gb = await scr(page, { x: gc.x + 7, y: gc.y });
  await game(page, g => g.paint.setPlantSet({ r: 7 }));
  await page.mouse.move(ga.x, ga.y); await page.mouse.down(); await page.mouse.move(gb.x, gb.y, { steps: 12 }); await page.mouse.up(); await sleep(500);
  await settle(page, 700);
  const t = await game(page, (g, gc) => {
    const gr = g.courseGrid, at = (x, y) => { const cx = Math.floor((x - gr.x0) / 0.5), cy = Math.floor((y - gr.y0) / 0.5); return cx >= 0 && cy >= 0 && cx < gr.w && cy < gr.h ? cy * gr.w + cx : -1; };
    const planted = [...g.props].filter(p => p.plant && Math.hypot(p.x - gc.x, p.y - gc.y) < 16); let onGreenTee = 0; for (const p of planted) { const i = at(p.x, p.y); if (i >= 0 && (gr.surf[i] === 8 || gr.surf[i] === 5)) onGreenTee++; }
    let greenCells = 0; for (let dx = -8; dx <= 8; dx += 0.5) for (let dy = -8; dy <= 8; dy += 0.5) { const i = at(gc.x + dx, gc.y + dy); if (i >= 0 && gr.surf[i] === 8) greenCells++; }
    return { planted: planted.length, onGreenTee, greenCells, total: g.plantedCount() };
  }, gc);
  check(t.total - p0 >= 3, `Trees: dragging over the green plants trees (${t.total - p0} planted)`);
  check(t.greenCells > 50 && t.onGreenTee === 0, `Trees: none stands on a green or a tee (${t.onGreenTee} of ${t.planted} near the green, ${t.greenCells} green cells under the brush)`);
  const box = [Math.min(ga.x, gb.x) - 140, Math.min(ga.y, gb.y) - 140, Math.max(ga.x, gb.x) + 140, Math.max(ga.y, gb.y) + 140];
  const share = changed(before, await mapPixels(page), box, 40);
  check(share > 0.01, `Trees: the map changed where they went in (${(share * 100).toFixed(1)}% of the pixels)`);
  await shot(page, `${S.tag}-09-trees`);
  await page.keyboard.press('Escape'); await sleep(300);
  await alive(page, 'after painting');
  await game(page, g => { g.paint.leavePlan(); g.setTool('select'); g.closeHoleCard(); g.emit(); });
}

async function clubhouse(S) {
  const { page } = S;
  await page.keyboard.press('Escape').catch(() => {});
  await look(page, S.mid1, 0.15); await settle(page, 600);
  await page.click('[data-rail="course"]'); await sleep(450);
  await page.click('[data-flyout-col="0"] [data-key="buildings"]'); await sleep(350);
  await page.click('[data-flyout-col="1"] [data-key*="club"]'); await sleep(500);
  // a spot the clubhouse may stand (its own ghost's verdict, asked of world points round the hole), then a real click there
  const spot = await page.evaluate(([near]) => {
    const g = window.__game, home = g.golf.range.home, pts = [near, { x: home[0] + home[2] / 2, y: home[1] + home[3] / 2 }];
    for (const c0 of pts) for (let r = 0; r <= 220; r += 8) for (let a = 0; a < Math.max(1, Math.round(2 * Math.PI * r / 8)); a++) {
      const t = a / Math.max(1, Math.round(2 * Math.PI * r / 8)) * Math.PI * 2, c = { x: c0.x + Math.cos(t) * r, y: c0.y + Math.sin(t) * r };
      g.clubUpdate(0, 0, c); const h = g.bizHover; if (h && !h.why) return c;
    }
    return null;
  }, [S.mid1]);
  check(!!spot, 'the clubhouse has a spot on the land');
  if (spot) { const ok = await clickMap(page, spot, 0.15); check(ok, 'a click on the map places the clubhouse'); await sleep(900); }
  check(await game(page, g => g.hasClubhouse), 'the clubhouse stands (the Play chip needs it)');
  await game(page, g => { g.setTool('select'); g.emit(); });
}

async function play(S) {
  const { page } = S;
  S.mid1 ??= await game(page, g => { const p = g.golf.pins.find(q => q.hole === 1); return { x: p.x, y: p.y }; });
  await clubhouse(S);
  const n = 1;
  // the old top-down shot panel must not open: it is where the "Stand In for swing meter art" caption was
  const open = async () => { await game(page, (g, n) => { g.holeCardHole = n; g.emit(); }, n); await sleep(500); await page.locator('[data-testid="hole-play"]').click(); await sleep(400); };
  await game(page, (g, n) => { g.holeCardHole = n; g.emit(); }, n); await sleep(500);
  check(await game(page, (g, n) => g.holePlayWhy(n) === null, n), 'hole 1 can be played yourself (a tee, a pin, a green, the clubhouse)', await game(page, (g, n) => g.holePlayWhy(n), n));
  await open();
  check(await page.locator('[data-testid="hole-play-choice"]').count() === 1, 'the hole card\'s Play chip asks: just this hole, or all of the course');
  const holes = await game(page, g => g.practiceHoleCount());
  await page.locator('[data-testid="hole-play-hole"]').click();
  await page.waitForFunction(n => window.__game.view3pHole === n && !!document.querySelector('[data-testid="view3p-frame"]'), n, { timeout: 30000 }).catch(() => {});
  let st = await game(page, g => ({ hole: g.view3pHole, round: !!g.yourRound(), practice: !!g.yourRound()?.practice, shot: !!g.shotState(), frame: !!document.querySelector('[data-testid="view3p-frame"]') }));
  check(st.hole === n && st.frame && st.round && st.practice && !st.shot, `Play > Just hole ${n} opens the golf view from behind the golfer (Cinderlinks, view3pHole ${st.hole}, its frame is up), not the top-down shot panel`, JSON.stringify(st));
  await sleep(6000);
  const fr = page.frames().find(f => /cinderlinks/.test(f.url()));
  check(!!fr, 'the Cinderlinks page is loaded in the view\'s frame', fr?.url().slice(-40));
  if (fr) check(await fr.evaluate(() => !!document.querySelector('canvas')).catch(() => false), 'the golf view draws its canvas');
  await shot(page, `${S.tag}-10-play-just-hole`);
  await noStandIn(page, 'in the golf view');
  await page.locator('[aria-label="Back to the course"]').first().click().catch(async () => { await game(page, g => g.close3p()); }); await sleep(900);
  check(await game(page, g => g.view3pHole === null), 'Back to the course closes the view');
  await game(page, g => g.yourRoundEnd()); await sleep(500);
  check(await game(page, g => !g.yourRound()), 'the practice round is ended');
  // all of the course, hole by hole in the same view
  if (holes > 0) {
    await open(); await page.locator('[data-testid="hole-play-all"]').click();
    await page.waitForFunction(() => window.__game.view3pHole !== null && !!document.querySelector('[data-testid="view3p-frame"]'), null, { timeout: 30000 }).catch(() => {});
    st = await game(page, g => ({ hole: g.view3pHole, round: g.yourRound() ? g.yourRound().holes?.length ?? g.yourRound().rows?.length ?? 0 : 0, practice: !!g.yourRound()?.practice, shot: !!g.shotState() }));
    check(st.hole !== null && st.practice && !st.shot, `Play > All ${holes} hole${holes === 1 ? '' : 's'} plays the round in the golf view (hole ${st.hole})`, JSON.stringify(st));
    await sleep(3000);
    await page.locator('[aria-label="Back to the course"]').first().click().catch(async () => { await game(page, g => g.close3p()); }); await sleep(900);
    await game(page, g => g.yourRoundEnd()); await sleep(500);
  }
  // the entry that cannot open the view says why and plays on from above (a hole the view refuses): a stub of the refusal
  const refuse = await game(page, g => {
    const was = g.hole3pWhy; g.hole3pWhy = () => ['No pin']; g.practiceStart(1, 'hole');
    const out = { view: g.view3pHole, round: !!g.yourRound(), toast: g.toasts.map(t => t.text ?? t.msg ?? '').find(t => /golf view cannot open/.test(t)) ?? null };
    g.hole3pWhy = was; if (g.yourRound()) g.yourRoundEnd(); return out;
  });
  check(refuse.view === null && refuse.round && !!refuse.toast, 'a hole the golf view refuses is played from above, and the toast says why', JSON.stringify(refuse));
  await game(page, g => { g.setTool('select'); g.closeHoleCard(); g.emit(); }); await sleep(400);
  await noStandIn(page, 'at the end of the run');
}

/** the jam: the same first hole is drawn; no hand shaping anywhere in the Holes panel */
async function jamChecks(S) {
  const { page } = S;
  // (the hole gate waits for months of range takings and the tools for the old range to be bought: the run opens them, as the jam smoke does; the hand shaping the checks look for
  //  is hidden by the JAM flag itself, not by that gate, so opening the gate hides nothing from them)
  await game(page, g => { g.paint.host.planLock = () => null; g.sandboxUnlock = true; g.emit(); });
  await openNewHole(page);
  const hand = () => page.evaluate(() => ({ shape: !!document.querySelector('[data-section="shape"]'), more: !!document.querySelector('[data-section="more"]'), swatches: !!document.querySelector('.swatches'), paintHole: !!document.querySelector('[data-section="edit-paint"]'), text: /Shape by hand|More options|Paint hole/.test(document.querySelector('[data-testid="tool-panel"]')?.innerText ?? '') }));
  let h = await hand(); check(!h.shape && !h.more && !h.swatches && !h.text, 'the jam Holes panel shows no hand shaping before a hole (no Shape by hand, More options, brushes)', JSON.stringify(h));
  await hole1(S);
  await openNewHole(page);
  h = await hand(); check(!h.shape && !h.more && !h.swatches && !h.text, 'and none after the first hole', JSON.stringify(h));
  const add = await page.evaluate(() => { const b = document.querySelector('[data-testid="hole-add"]'); return { exists: !!b, menu: b?.getAttribute('aria-haspopup') ?? null }; });
  check(add.exists && add.menu === null, 'the jam\'s + plans a hole at once (no saved holes, no empty hole to paint by hand)', JSON.stringify(add));
  await page.click('[data-hole="1"]'); await sleep(500); await page.locator('[data-testid="hole-edit"]').click(); await sleep(800);
  h = await hand(); check(!h.paintHole && !h.swatches, 'Edit Hole Layout in the jam has no Paint hole palette', JSON.stringify(h));
  await noStandIn(page, 'in the jam');
}

// ---------------------------------------------------------------- the run
const steps = { start, hole1, menu, hole2, paint, play };
async function runVariant(name) {
  const jam = name === 'jam';
  let srv = null, base = opt('base', '');
  if (!base) { lap(`starting a ${name} dev server`); srv = await serve(jam); base = srv.base; }
  const S = await launch(jam); S.base = base; S.tag = name;
  console.log(`\n=== ${name}: ${base} (Chrome ${S.browser.version()}) ===`);
  try {
    if (jam) { await start(S); await jamChecks(S); }
    else for (const [k, f] of Object.entries(steps)) { if (!STEPS.has(k)) continue; lap(`-- ${k}`); await f(S); }
    for (const e of S.errors) check(false, `console: ${e}`);
    if (!S.errors.length) check(true, `${name}: no console error, no page error, no worker error`);
  } catch (e) { check(false, `${name}: the run stopped: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')}`); try { await shot(S.page, `${name}-stopped`); } catch { /* none */ } }
  finally {
    if (!has('keep')) { await S.ctx.close().catch(() => {}); if (!has('cdp')) await S.browser.close().catch(() => {}); }
    if (srv) await srv.server.close().catch(() => {});
  }
}
try { for (const v of variants) await runVariant(v); }
finally { /* every browser and server this run started is closed above */ }
console.log(`\n${rows.length} checks, ${bad ? `${bad} FAILED` : 'all passed'}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(bad ? 1 : 0);

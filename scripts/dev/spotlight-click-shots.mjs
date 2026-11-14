// #1297 (the owner, 2026-11-14: a guide step's Show me lit the Course button, "clicking there does not open", and never led on to the thing the step names; the step's words said
// Range): the play-through of every Show me, in the game as a player plays it. For each step, tip and lead it presses Show me (or puts the request up), then does what the
// spotlight asks, level by level, with real mouse clicks at the middle of the lit cut-out: the control must be the thing under the pointer (the cut-out lets the click through),
// the click must open the next level, which must then be lit (the caption's breadcrumb says where it is), and the last click, on the entry itself, must do what the entry does
// and end the spotlight. It also checks that a click anywhere else, or Esc, just closes the spotlight (an open menu stays open), that a level left alone is opened by the
// spotlight itself after a moment, that the cut-out is the control (a click near its edge reaches the control, not its neighbour), and that nothing blocks a click before something is lit.
//   node scripts/dev/spotlight-click-shots.mjs --base http://127.0.0.1:5733/ [--jam] [--out docs/ui-shots] [--w 1366 --h 768] [--scale 1.25] [--only a,b] [--no-shots]
// The normal build on a dev server (vite on a scratch port); --jam: the jam build (the dev server run with VITE_JAM=1). Scenarios (--only): place, buckets, practice, hole,
// elsewhere, auto, perf, tutorial, mapclick (normal build); tour, tips (jam build). One headless Chrome per run, closed when done; a fresh profile, so the start is a new game. Prints ok/FAIL per
// check (exit 1 on a FAIL). Saves are not written.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5733/'), jam = has('jam'), out = opt('out', 'output/spotlight-click-shots'), W = Number(opt('w', 1366)), H = Number(opt('h', 768)), scale = Number(opt('scale', 1));
const noShots = has('no-shots'), only = new Set(opt('only', jam ? 'tour,tips' : 'place,buckets,practice,hole,elsewhere,auto,perf,tutorial,mapclick').split(','));
const tag = opt('tag', scale === 1 ? '' : `${Math.round(scale * 100)}pct-`);
mkdirSync(out, { recursive: true });
const t0 = Date.now(), lap = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; return ok; };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });

// ---------------------------------------------------------------- the game
async function boot() {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: false });
  await ctx.addInitScript(s => { try { localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase?.('ce'); if (s !== 1) localStorage.setItem('capitalempire.uiScale', String(s)); } catch { /* none */ } }, scale);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}${jam ? '' : '?fixture=range20'}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
  if (jam) { await page.locator('[data-testid="title-card"]').waitFor({ timeout: 240000 }); await page.locator('[data-testid="title-new"]').click(); }
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); });
  if (jam) {
    const who = page.locator('button', { hasText: "That's me" }); await who.waitFor({ timeout: 90000 });
    await page.locator('input[placeholder="Your name"]').fill('Spot Light').catch(() => {}); await who.click();
  } else await page.evaluate(() => window.__game.closeWho('Tester', 2));
  // J9: the start is chosen first: "Pick a spot for me" lays it (the range, the home and the road)
  await page.waitForFunction(() => window.__game.firstViewBaked, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; if (g.startPick) g.startPickAuto(); });
  await page.waitForFunction(() => !!window.__game.range?.scene, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.money = Math.max(g.money, 400000); });
  await sleep(1500);
  lap(`${jam ? 'jam' : 'normal'} game ready at ${W}x${H}, text ${Math.round(scale * 100)}%`);
  return { ctx, page };
}
const G = (page, fn, arg) => page.evaluate(fn, arg);

/** what the spotlight shows now (null: none up) */
const probe = page => G(page, () => {
  const L = document.querySelector('[data-testid="spotlight"]'), C = document.querySelector('[data-testid="spotlight-caption"]'); if (!L || !C) return null;
  const box = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  return {
    on: L.dataset.on, pe: getComputedStyle(L).pointerEvents, lit: C.dataset.lit ?? '', level: Number(C.dataset.level ?? -1), side: C.dataset.side, cap: box(C),
    crumbs: document.querySelector('[data-testid="spotlight-crumbs"]')?.textContent ?? '', title: C.querySelector('.spot-cap-title')?.textContent ?? '', line: C.querySelector('.spot-cap-line')?.textContent ?? '',
    rings: [...document.querySelectorAll('[data-testid="spotlight-ring"]')].filter(r => r.style.display !== 'none').map(box),
  };
});
/** the state the clicks change */
const world = page => G(page, () => { const g = window.__game; return { tool: g.tool, uiTool: g.uiTool, placing: g.placing?.id ?? null, card: g.range.cardOpen, fly: document.querySelectorAll('[data-flyout-col]').length, panel: g.panel, plan: !!g.paint?.planOpen, kind: g.practice?.kind ?? null, roadClass: g.roadClass ?? null, practiceAt: !!g.golf?.range?.practiceAt, lot: !!g.golf?.range?.lot, money: Math.round(g.money), land: g.landMode }; });
/** a control's box and what a click at its middle and at points just inside its corners would hit (the control, or something else) */
const ctrl = (page, anchor) => G(page, a => {
  const el = [...document.querySelectorAll(`[data-guide="${a}"]`)].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!el) return null;
  const r = el.getBoundingClientRect(), pts = [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 3, r.y + 3], [r.right - 3, r.y + 3], [r.x + 3, r.bottom - 3], [r.right - 3, r.bottom - 3], [r.x + r.width / 2, r.y + 3], [r.x + r.width / 2, r.bottom - 3]];
  // (a rounded control: its corners are cut: the points are taken a few px in along the diagonal)
  const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, k = Math.min(rad * 0.3, 8);
  const fails = [];
  const hits = pts.map(([x, y], i) => { const px = i >= 1 && i <= 4 ? x + (x < r.x + r.width / 2 ? k : -k) : x, py = i >= 1 && i <= 4 ? y + (y < r.y + r.height / 2 ? k : -k) : y, t = document.elementFromPoint(px, py), ok = !!t && (t === el || el.contains(t)); if (!ok) fails.push(`${['mid', 'tl', 'tr', 'bl', 'br', 'top', 'bottom'][i]}@${Math.round(px)},${Math.round(py)}: ${t ? `${t.tagName}.${String(t.className).slice(0, 30)}[${t.closest('[data-guide]')?.dataset.guide ?? ''}]` : 'nothing'}`); return ok; });
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, hits, mid: hits[0], all: hits.every(Boolean), fails, box: [r.x, r.y, r.width, r.height].map(Math.round).join(',') };
}, anchor);
/** waits until a control's box stops moving (a smooth scroll into its card, a column placing itself) */
async function settled(page, anchor, ms = 3000) { let prev = ''; const t = Date.now(); for (;;) { const c = await ctrl(page, anchor); const k = c ? c.box : ''; if (k && k === prev) return c; prev = k; if (Date.now() - t > ms) return c; await sleep(120); } }
const waitLit = async (page, anchor, ms = 6000) => { const t = Date.now(); for (;;) { const p = await probe(page); if (p && p.on === '1' && p.lit === anchor && p.rings.length) return p; if (Date.now() - t > ms) return p; await sleep(120); } };
const gone = async (page, ms = 1500) => { const t = Date.now(); for (;;) { if (!(await probe(page))) return true; if (Date.now() - t > ms) return false; await sleep(100); } };
const shot = async (page, name) => { if (noShots) return; await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 8000 }).catch(() => {}); const f = join(out, `${tag}${name}.jpg`), png = await page.screenshot({ type: 'png' }); await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toFile(f); console.log('  ' + f); };
const esc = async page => { await page.keyboard.press('Escape'); await sleep(250); };

/** presses the guide card's Show me for step n (the current line's button, or a later line's Show) */
async function showGuide(page, n) {
  const cur = await G(page, () => window.__game.rangeGuideView()?.lines.find(l => l.current)?.step.n ?? 0);
  await page.locator(cur === n ? '[data-testid="range-guide-show"]' : `[data-testid="range-guide-show-${n}"]`).first().click(); await sleep(300);
}
/** follows the lead: for each anchor in order the control must be lit (the breadcrumb at its level), a click at its middle (and just inside its corners) must reach it, and a click there is
 *  made for real; the spotlight goes on after every level but the last, whose click ends it. shots: a screenshot name for each level (null: none). Returns the world after the last click */
async function follow(page, name, anchors, o = {}) {
  let ok = true;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i], last = i === anchors.length - 1, p = await waitLit(page, a, o.wait ?? 7000);
    ok = check(!!p && p.lit === a, `${name}: level ${i + 1} of ${anchors.length} is lit: ${a}${p && p.lit !== a ? ` (lit: ${p.lit || 'nothing'})` : ''}`) && ok;
    if (!p || p.lit !== a) return null;
    if (p.crumbs) console.log(`     ${p.crumbs}   [${p.level}]  "${p.line}"`);
    const c = await settled(page, a);
    ok = check(!!c && c.mid, `${name}: ${a}: the pointer at the middle of the cut-out is over the control (the click goes through)${c && !c.mid ? ` ${c.fails.join(' | ')}` : ''}`) && ok;
    ok = check(!!c && c.all, `${name}: ${a}: and just inside its edges and corners too (what is lit is what a click reaches)${c && !c.all ? ` ${c.fails.join(' | ')}` : ''}`) && ok;
    if (o.shots?.[i]) await shot(page, o.shots[i]);
    if (o.before?.[i]) await o.before[i]();
    await page.mouse.click(c.x, c.y); await sleep(o.settle ?? 500); // (the move and the click at once: a pointer that rests on a lit tile opens its column by hover, which the spotlight holds the lead for)
    const up = !!(await probe(page));
    ok = check(last ? !up : up, `${name}: after the click on ${a} the spotlight ${last ? 'is over (the entry did its work)' : 'goes on to the next level'}`) && ok;
    if (last) break;
  }
  return world(page);
}
/** puts a request up by hand (the engine's own pulse is not used) */
const spotUp = (page, targets, title = 'A Show me', line = 'A line.') => G(page, ([t, ti, li]) => window.__spot.show({ title: ti, line: li, targets: t }), [targets, title, line]);
/** closes whatever the last scenario left: the spotlight, a flyout, the card, the tool in hand, the placement */
async function reset(page) {
  await G(page, () => { window.__spot?.hide(); const g = window.__game; g.cancelPlacing?.(); g.openRangeCard(false); g.setTool('select'); g.panel = null; if (g.landMode) g.closeLandSale?.(); g.guideAnchor = null; g.emit(); });
  await page.keyboard.press('Escape'); await sleep(300);
  await G(page, () => { window.__spot?.hide(); });
  await sleep(200);
}
/** the first spot a placement accepts (the placing's own rules), then it is built there */
const buildPlacing = (page, id, around, span, step) => G(page, ([id, around, span, step]) => {
  const g = window.__game; g.placeRangePart(id); const p = g.placing; if (!p) return 'no placing';
  const c = around === 'J' ? g.range.scene.J : around === 'edge' ? g.range.scene.carEdge : g.range.scene.counter;
  for (let r = 0; r <= span; r += step) for (let dy = -r; dy <= r; dy += step) for (let dx = -r; dx <= r; dx += step) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const s = p.spot(c.x + dx, c.y + dy); if (p.why(s)) continue;
    if (p.build(s)) { g.placing = null; g.emit(); return 'placed'; }
  }
  g.placing = null; return 'no spot';
}, [id, around, span, step]);

try {
  const { ctx, page } = await boot();
  if (!jam) await normal(page); else await jamRun(page);
  await ctx.close();
} catch (e) {
  console.log('[script failed]', String(e.stack ?? e).split('\n').slice(0, 4).join(' | ')); bad++;
} finally { await browser.close(); }
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);

// ---------------------------------------------------------------- the normal build
async function normal(page) {
  // the guide on its steps, the tutorial off (its own scenario boots again), every tool open (no ramp lock stands between a Show me and its menu)
  await G(page, () => { const g = window.__game, p = g.golf.progress; for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; g.setAdvancedTools(true); g.closeWelcome?.(false); g.emit(); });
  await sleep(800);
  const st = await G(page, () => { const g = window.__game; return { rail: [...document.querySelectorAll('[data-testid="rail"] [data-rail]')].map(b => b.dataset.rail).join(','), lines: g.rangeGuideView()?.lines.map(l => `${l.step.n}:${l.state}${l.current ? '*' : ''}`).join(' '), places: g.rangePlaces().map(q => `${q.id}:${q.done}`).join(',') }; });
  console.log('  start:', JSON.stringify(st));

  if (only.has('place')) {
    // ---- Range > Place the car park (the range stands from the start): the lead is the rail button, then the row of its flyout
    await reset(page);
    await showGuide(page, 2);
    await G(page, () => window.__game.cancelPlacing());
    const w = await follow(page, 'step 2 (car park)', ['rail-range', 'place-carpark'], { shots: ['spotlight-click-1-range-button', 'spotlight-click-2-place-the-car-park'] });
    check(!!w && w.placing === 'carpark', `step 2: the entry's click took the car park in hand (placing: ${w?.placing})`);
    const b = await buildPlacing(page, 'carpark', 'J', 60, 2); check(b === 'placed', `the car park is placed: ${b}`);
    await reset(page);
  }
  if (only.has('buckets')) {
    // ---- the guide's step 3, the buckets and the balls: the card with its takings first (the engine's act opens it: its control is lit at once), then, once buckets are sold and balls lie out,
    // Walk in hand and the Walk button lit. A click through either reaches the control and ends the spotlight
    await reset(page);
    await showGuide(page, 3);
    const w = await follow(page, 'step 3 (the takings)', ['range-takings']);
    check(!!w && w.card, `step 3: the click went through to the range card (card open: ${w?.card})`);
    await reset(page);
    // (buckets sold and balls lying out on the range: their place on the map is faked, as the jam script does)
    await G(page, () => {
      const g = window.__game, sc = g.range.scene, b = g.golf?.range; if (!sc || !b?.balls) return;
      b.total.golfers = Math.max(b.total.golfers, 5); b.balls.field = [];
      for (let i = 0; i < 60; i++) { const d = 25 + (i % 8) * 4, a = (i - 30) * 0.8; b.balls.field.push(sc.counter.x + sc.rangeSide.x * d + sc.roadDir.x * a, sc.counter.y + sc.rangeSide.y * d + sc.roadDir.y * a); }
      g.emit();
    });
    await showGuide(page, 3);
    const w2 = await follow(page, 'step 3 (the balls)', ['rail-walk']);
    check(!!w2, 'step 3: the Walk button is lit and the click goes through to it');
    await reset(page);
  }
  if (only.has('practice')) {
    // ---- the practice hints' Show me (the hint bar's, a range start after its guide): Course > Facilities > Practice > Putting green. The engine's act has the practice tool in hand; put down, the
    // lead is the menu, level by level, and the last click takes the putting green in hand
    await reset(page);
    // Range > Place the practice area, while it is still to place: the row of the Range flyout, the last click takes the practice area in hand
    await spotUp(page, [{ ui: 'place-practice' }], 'Place the practice area', 'Range › Place the practice area.');
    const w0 = await follow(page, 'place the practice area', ['rail-range', 'place-practice']);
    check(!!w0 && w0.placing === 'practice', `Range > Place the practice area: the last click took the practice area in hand (${w0?.placing})`);
    await reset(page);
    const b = await buildPlacing(page, 'practice', 'edge', 90, 2); check(b === 'placed', `the practice area is placed: ${b}`);
    await sleep(500);
    await G(page, () => { const g = window.__game, base = g.guideAnchor; g.showHint('hint-practice-putting'); window.__spot.show({ title: 'Build a putting green', line: 'Course ▸ Facilities ▸ Practice ▸ Putting green: move it over the Practice area beside the car park and click.', targets: [{ pulse: null }] }, base); });
    const p = await waitLit(page, 'rail-course', 9000);
    check(!!p && p.crumbs === 'Course › Facilities › Practice › Putting green', `the hint's Show me: the caption's way down is "${p?.crumbs}"`);
    await G(page, () => { window.__game.setTool('select'); window.__game.emit(); });
    const w = await follow(page, 'practice hint', ['rail-course', 'rail-facilities', 'facilities-practice', 'practice-putting'],
      { shots: ['spotlight-click-4-practice-1-course', 'spotlight-click-5-practice-2-facilities', 'spotlight-click-6-practice-3-practice', 'spotlight-click-7-practice-4-putting-green'] });
    check(!!w && w.tool === 'practice' && w.kind === 'putting', `practice hint: the last click took the putting green in hand (tool ${w?.tool}, kind ${w?.kind})`);
    await reset(page);
  }
  if (only.has('hole')) {
    // ---- the menu paths of the Fix buttons and the hole: Course > Holes > New hole, Course > Buildings > Clubhouse, Traffic > Transport > Car park
    await reset(page);
    await spotUp(page, [{ ui: 'new-hole' }], 'Build a hole', 'Course › Holes › New hole.');
    const w = await follow(page, 'New hole by the menu', ['rail-course', 'course-holes', 'new-hole']);
    check(!!w && w.uiTool === 'course', `New hole by the menu: the last click took the Course tool (tool ${w?.uiTool})`);
    await reset(page);
    await spotUp(page, [{ ui: 'clubhouse-card' }], 'The clubhouse', 'Course › Buildings › Clubhouse.');
    const w3 = await follow(page, 'Clubhouse by the menu', ['rail-course', 'course-buildings', 'clubhouse-card']);
    check(!!w3, 'Course > Buildings > Clubhouse');
    await reset(page);
    await spotUp(page, [{ ui: 'tool-park' }], 'A car park', 'Traffic › Transport › Car park.');
    const w4 = await follow(page, 'Car park by the menu', ['rail-traffic', 'traffic-transport', 'tool-park']);
    check(!!w4 && w4.tool === 'park', `Traffic > Transport > Car park: the last click took the Car park tool (tool ${w4?.tool})`);
    await reset(page);
  }
  if (only.has('elsewhere')) {
    // ---- a click anywhere else only closes the spotlight (an open menu stays open); Esc the same; nothing blocks a click before something is lit
    await reset(page);
    await spotUp(page, [{ ui: 'practice-putting' }], 'Putting green', 'Course › Facilities › Practice › Putting green.');
    let p = await waitLit(page, 'rail-course', 8000); check(!!p, 'elsewhere: the rail button is lit');
    const c = await ctrl(page, 'rail-course'); await page.mouse.click(c.x, c.y); await sleep(500);
    p = await waitLit(page, 'rail-facilities', 6000); check(!!p, 'elsewhere: after Course the Facilities tile is lit');
    const flyBefore = await world(page);
    await page.mouse.click(W - 60, H - 60); await sleep(500);
    const after = await world(page);
    check(!(await probe(page)) && after.fly === flyBefore.fly && after.fly > 0, `elsewhere: a click on the dimmed page closes the spotlight and leaves the flyout open (${flyBefore.fly} -> ${after.fly} columns)`);
    check(after.tool === flyBefore.tool && after.placing === flyBefore.placing && after.panel === flyBefore.panel, 'elsewhere: and does nothing else');
    await reset(page);
    await spotUp(page, [{ ui: 'rail-course' }]); await waitLit(page, 'rail-course', 8000);
    await esc(page); check(!(await probe(page)), 'Esc closes the spotlight');
    await reset(page);
    // a request with nothing to light: before it gives up the layer must not catch a click
    await spotUp(page, [{ ui: 'no-such-anchor' }]); await sleep(300);
    const q = await probe(page); check(!!q && q.on === '0' && q.pe === 'none', `a spotlight with nothing lit yet takes no click (data-on ${q?.on}, pointer-events ${q?.pe})`);
    const rc = await ctrl(page, 'rail-course'); await page.mouse.click(rc.x, rc.y); await sleep(500);
    check((await world(page)).fly > 0, 'and a click on the page while it waits reaches the page: the Course flyout opened under the pointer');
    check(!(await probe(page)), 'and, as a click elsewhere does, it ends the spotlight');
    await reset(page);
  }
  if (only.has('auto')) {
    // ---- a level left alone is opened by the spotlight itself after a moment, and hovering the lit tile opens its next level
    await reset(page);
    await spotUp(page, [{ ui: 'practice-putting' }], 'Putting green', 'Course › Facilities › Practice › Putting green.');
    const seen = [];
    for (const a of ['rail-course', 'rail-facilities', 'facilities-practice', 'practice-putting']) { const p = await waitLit(page, a, 9000); seen.push(p?.lit ?? 'none'); if (!p || p.lit !== a) break; }
    check(seen.join() === 'rail-course,rail-facilities,facilities-practice,practice-putting', `auto: left alone it opens each level itself: ${seen.join(' > ')}`);
    const fin = await world(page); check(fin.fly >= 3 && fin.tool !== 'practice', `auto: the last level is lit and not pressed for the player (${fin.fly} columns, tool ${fin.tool})`);
    await reset(page);
    await spotUp(page, [{ ui: 'practice-putting' }], 'Putting green', 'Course › Facilities › Practice › Putting green.');
    await waitLit(page, 'rail-course', 8000);
    const c = await settled(page, 'rail-course'); await page.mouse.click(c.x, c.y);
    await waitLit(page, 'rail-facilities', 6000);
    const f = await settled(page, 'rail-facilities'); await page.mouse.move(f.x, f.y); await sleep(900);
    const held = await probe(page), cols = (await world(page)).fly;
    check(cols >= 2 && held?.lit === 'rail-facilities', `hover: the pointer on the lit Facilities tile opens its column (${cols} columns) and the tile stays lit under it (a click there still lands on it): lit ${held?.lit}`);
    const pr = await settled(page, 'facilities-practice'); await page.mouse.move(pr.x, pr.y);
    const hp = await waitLit(page, 'facilities-practice', 3000); check(!!hp, 'hover: the pointer leaving the tile for the next column: the Practice row is lit');
    await reset(page);
  }
  if (only.has('perf')) {
    // ---- what the tracker costs a frame: the DOM queries and rectangle reads the page makes in a second, with no spotlight, with an outer level lit (the rail button, waiting for its click: it looks for the
    // deeper levels a few times a second) and with the last level lit (one rectangle a frame, no query). The page's own are in the baseline (the game is paused)
    await reset(page);
    await G(page, () => {
      if (window.__cnt) return;
      window.__cnt = { q: 0, r: 0 }; const q = document.querySelectorAll.bind(document), r = Element.prototype.getBoundingClientRect;
      document.querySelectorAll = s => { window.__cnt.q++; return q(s); };
      Element.prototype.getBoundingClientRect = function () { window.__cnt.r++; return r.call(this); };
    });
    const sample = ms => G(page, ms => new Promise(res => {
      const c = window.__cnt; c.q = 0; c.r = 0; let f = 0, prev = performance.now(); const t0 = prev, d = [];
      const go = t => { f++; d.push(t - prev); prev = t; if (t - t0 < ms) requestAnimationFrame(go); else { d.sort((a, b) => a - b); res({ q: c.q, r: c.r, f, secs: (t - t0) / 1000, med: d[d.length >> 1] }); } };
      requestAnimationFrame(go);
    }), ms);
    const row = (name, s) => console.log(`  ${name.padEnd(34)} ${(s.q / s.secs).toFixed(1).padStart(6)} queries/s ${(s.r / s.f).toFixed(2).padStart(6)} rects/frame  ${s.f} frames, median ${s.med.toFixed(1)} ms`);
    const base = await sample(3000); row('no spotlight', base);
    await spotUp(page, [{ ui: 'practice-putting' }], 'Putting green', 'Course › Facilities › Practice › Putting green.');
    await waitLit(page, 'rail-course', 9000); const outer = await sample(2400); row('an outer level lit (the rail button)', outer);
    await reset(page);
    await spotUp(page, [{ ui: 'rail-walk' }], 'Walk', 'Take Walk.');
    await waitLit(page, 'rail-walk', 9000); await sleep(700); const fin = await sample(3000); row('the last level lit (one control)', fin);
    check((fin.r - base.r) / fin.f <= (base.r / base.f) + 1.6, `perf: the last level costs about one rectangle a frame over the page's own (${((fin.r - base.r * fin.secs / base.secs) / fin.f).toFixed(2)} more a frame)`);
    check((fin.q / fin.secs) <= (base.q / base.secs) + 2, `perf: the last level makes no DOM query of its own (${(fin.q / fin.secs - base.q / base.secs).toFixed(1)} more a second)`);
    check((outer.q / outer.secs) - (base.q / base.secs) <= 45, `perf: an outer level waits with at most a few dozen queries a second (${(outer.q / outer.secs - base.q / base.secs).toFixed(1)} more), not one per frame`);
    await reset(page);
  }
  if (only.has('tutorial')) {
    // ---- the start tutorial's steps (a new game's): Traffic > Roads > Build, Traffic > Roads > Upgrade, the Range button
    await reset(page);
    await G(page, () => { const g = window.__game, p = g.golf.progress; if (p.tour) p.tour.off = false; g.emit(); });
    await sleep(1500);
    const hasTour = await G(page, () => !!window.__game.tourView());
    check(hasTour, 'the tutorial runs');
    if (hasTour) {
      await page.locator('[data-testid="tour-next"]').first().click(); await sleep(500); // step 1 (the town) done: step 2
      await G(page, () => { window.__spot?.hide(); window.__game.guideAnchor = null; });
      await page.locator('[data-testid="tour-show"]').first().click(); await sleep(300);
      const w = await follow(page, 'tutorial 2 (roads)', ['rail-traffic', 'traffic-roads', 'traffic-build']);
      check(!!w && w.fly > 0, `tutorial 2: the last click opened the road classes (${w?.fly} columns)`);
      await reset(page);
      await G(page, () => { const p = window.__game.golf.progress.tour; p.done.push('tour-roads'); window.__game.emit(); });
      await sleep(500);
      await page.locator('[data-testid="tour-show"]').first().click(); await sleep(300);
      const w3 = await follow(page, 'tutorial 3 (upgrade)', ['rail-traffic', 'traffic-roads', 'road-upgrade']);
      check(!!w3 && w3.tool === 'lane', `tutorial 3: the last click took the Upgrade tool (tool ${w3?.tool})`);
      await reset(page);
      await page.locator('[data-testid="tour-next"]').first().click(); await sleep(500);
      await G(page, () => { window.__spot?.hide(); window.__game.guideAnchor = null; });
      await page.locator('[data-testid="tour-show"]').first().click(); await sleep(300);
      const w4 = await follow(page, 'tutorial 4 (golf)', ['rail-range']);
      check(!!w4 && w4.fly > 0, `tutorial 4: the click opened the Range menu (${w4?.fly} columns)`);
      await reset(page);
    }
  }
  if (only.has('mapclick')) {
    // ---- a place on the map: the cut-out lets the click through to the map
    await reset(page);
    const box = await G(page, () => { const g = window.__game, sc = g.range.scene, b = { x: 0, y: 0, w: 0, h: 0 }; const f = sc.front; g.spotScreen([f[0], f[1], f[0] + f[2], f[1] + f[3]], b); return b; });
    await spotUp(page, [{ tiles: await G(page, () => { const f = window.__game.range.scene.front; return [f[0], f[1], f[0] + f[2], f[1] + f[3]]; }) }], 'The range', 'Your driving range.');
    const t = Date.now(); let p = null; while (Date.now() - t < 5000) { p = await probe(page); if (p && p.on === '1' && p.rings.length) break; await sleep(150); }
    check(!!p && p.rings.length > 0, `map: the range's place on the map is lit (${p?.rings[0] ? `${Math.round(p.rings[0].w)}x${Math.round(p.rings[0].h)}` : 'none'})`);
    if (p?.rings.length) {
      const r = p.rings[0], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const top = await G(page, ([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}${e.className?.toString().includes('touch-none') ? '.map' : ''}` : null; }, [cx, cy]);
      check(/canvas.*map|CANVAS/i.test(String(top)), `map: a click in the cut-out reaches the map canvas (${top})`);
      await shot(page, 'spotlight-click-8-a-place-on-the-map');
      await page.mouse.click(cx, cy); await sleep(500); check(!(await probe(page)), 'map: and the click ends the spotlight');
    }
    await reset(page);
  }
}

// ---------------------------------------------------------------- the jam build
async function jamRun(page) {
  await G(page, () => { const g = window.__game, p = g.golf.progress; for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); g.emit(); });
  await page.locator('[data-testid="tour"]').waitFor({ timeout: 60000 }).catch(() => {});
  await sleep(1000);
  if (only.has('tour')) {
    check(await page.locator('[data-testid="tour"]').isVisible().catch(() => false), 'the jam tutorial is up');
    await page.locator('[data-testid="tour-next"]').first().click(); await sleep(600);       // step 1 -> 2 (the Bank)
    await G(page, () => { window.__spot?.hide(); const g = window.__game; g.guideAnchor = null; if (g.panel === 'bank') g.toggleMoneyPanel(); });
    await page.locator('[data-testid="tour-show"]').first().click(); await sleep(300);
    const w = await follow(page, 'jam tutorial 2 (the Bank)', ['bank-panel'], { settle: 700 });
    check(!!w && w.panel === 'bank', `jam tutorial 2: the Bank stays open under the click (${w?.panel})`);
    await G(page, () => { const g = window.__game; if (g.panel === 'bank') g.toggleMoneyPanel(); window.__spot?.hide(); });
    await page.locator('[data-testid="tour-next"]').first().click(); await sleep(600);       // step 3 (Build)
    await G(page, () => { window.__spot?.hide(); window.__game.guideAnchor = null; });
    await page.locator('[data-testid="tour-show"]').first().click(); await sleep(300);
    await follow(page, 'jam tutorial 3 (Build)', ['rail-build'], { shots: ['spotlight-click-jam-1-build-button'] });
    check(await page.locator('[data-testid="build-menu"]').isVisible().catch(() => false), 'jam tutorial 3: the click on Build opened the Build menu');
    await page.locator('[data-testid="build-close"]').click({ timeout: 800 }).catch(() => {});
  }
  if (only.has('tips')) {
    await G(page, () => { window.__spot?.hide(); const g = window.__game; g.guideAnchor = null; g.openRangeCard(false); g.panel = null; g.emit(); });
    for (const [id, anchors, effect] of [['tip-build', ['build-menu'], w => true], ['tip-bank', ['bank-panel'], w => w.panel === 'bank']]) {
      await G(page, () => { window.__spot?.hide(); const g = window.__game; if (g.panel === 'bank') g.toggleMoneyPanel(); g.openRangeCard(false); });
      if (!(await page.locator('[data-testid="tips"]').isVisible().catch(() => false))) {
        if (!(await page.locator('[data-testid="build-menu"]').isVisible().catch(() => false))) await page.locator('[data-rail="build"]').click();
        await page.locator('[data-testid="build-tips"]').click(); await sleep(400);
      }
      const head = page.locator(`[data-testid="tips-${id}"] button[aria-expanded]`).first();
      if (await head.getAttribute('aria-expanded') !== 'true') await head.click();
      await page.locator(`[data-testid="tips-show-${id}"]`).click(); await sleep(300);
      const w = await follow(page, `jam ${id}`, anchors, { settle: 700 });
      check(!!w && effect(w), `jam ${id}: the click went through to what was lit`);
    }
  }
}

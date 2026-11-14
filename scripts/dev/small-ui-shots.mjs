// #1282 and #1275 (the owner, 2026-11-14): in-game checks and shots of the speed bar collapsing and of the map's pointer cursor.
//   node scripts/dev/small-ui-shots.mjs --base http://127.0.0.1:5741/ --out docs/ui-shots [--jam] [--no-shots] [--part speed|cursor|all]
// Needs a dev server (vite) on --base: the normal game (`npx vite --port N`) or, with --jam, the jam build's (`VITE_JAM=1 npx vite --port N`). Headless Chrome, one
// browser, closed when done; a fresh profile every context. Writes docs/ui-shots/small-ui-1282-*.jpg and prints every check (ok / FAIL); exit 1 on a FAIL.
// SPEED: the bar collapsed by default (pause, the speed now, a chevron), the keys , . and Space with it shut and open, open (every speed, Watch golf and skip; the
//   jam's shorter bar), its state remembered over a reload, and at the largest Text size (125%) nothing past the screen and no sideways scroll.
// CURSOR (the normal game's grown town, Select in hand): the computed cursor over a building, the range, its practice area, a hole, a person, open ground, with a
//   tool in hand and with Walk; an ORACLE over a grid of the screen (the engine's clickOpensAt against what a real click opens: they must agree everywhere); and the
//   cost of the pick (its time each frame while the pointer sweeps the map, and per call).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5741/'), out = opt('out', 'output/small-ui-shots'), part = opt('part', 'all'), jam = args.includes('--jam'), noShots = args.includes('--no-shots');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tag = jam ? 'jam' : 'game';
const short = s => (s.length > 70 ? `${s.slice(0, 44)}…${s.slice(-22)}` : s);

/** opens a page: a fresh context (an empty profile), saves not written, to the game's top bar (the jam: past its title card and Who are you) */
async function open(size, scale, query = '', ctx0 = null) {
  const ctx = ctx0 ?? await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}${query}`, { timeout: 300000, waitUntil: 'domcontentloaded' });
  await start(page);
  if (scale !== 1) { // the Text size as a player sets it (Settings, the chip of that size: the UI's own state follows, the top bar drops its tiles at the largest)
    const gear = page.locator('[data-tip="Settings"]').first();
    await gear.click(); await page.locator(`[data-scale="${scale}"]`).click(); await gear.click();
  }
  await sleep(800);
  return { ctx, page };
}
/** past the jam's title card and Who are you, or the normal game's welcome; the sim paused */
async function start(page) {
  if (jam) {
    const card = page.locator('[data-testid="title-card"]');
    await card.waitFor({ timeout: 300000 });
    const cont = page.locator('[data-testid="title-continue"]');
    await (await cont.isVisible().catch(() => false) ? cont : page.locator('[data-testid="title-new"]')).click();
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    const me = page.locator('button', { hasText: "That's me" });
    if (await me.waitFor({ timeout: 30000 }).then(() => true).catch(() => false)) await me.click();
  } else {
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    await page.evaluate(() => { const g = window.__game; g.closeWho?.('Tester', 2); g.closeWelcome?.(false); const p = g.golf?.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
  }
  await page.waitForSelector('[data-testid="speed-toggle"]', { timeout: 120000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; });
}
/** the top bar's right cluster: the speed bar, the zoom, Grass and the gear */
const cluster = page => page.locator('[data-testid="speed-toggle"]').locator('xpath=../..');
const barBox = page => cluster(page).boundingBox();
const shotBar = async (page, name) => {
  if (noShots) return;
  // (a picture the bar shows for the first time (the chevron's other way, the skip icon) loads from the dev server: shot only when every picture of the cluster is in)
  await page.waitForFunction(() => { const c = document.querySelector('[data-testid="speed-toggle"]').parentElement.parentElement; return [...c.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0); }, null, { timeout: 20000 }).catch(() => console.log('  (some picture of the bar was still loading)'));
  await sleep(150);
  const b = await barBox(page), vp = page.viewportSize(), pad = 10;
  const x0 = Math.max(0, Math.floor(b.x - pad)), y0 = Math.max(0, Math.floor(b.y - pad)), w = Math.min(vp.width - x0, Math.ceil(b.width + 2 * pad)), h = Math.ceil(b.height + 2 * pad);
  const png = await page.screenshot({ type: 'png', clip: { x: x0, y: y0, width: w, height: h } });
  const file = join(out, `small-ui-1282-${name}.jpg`); await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toFile(file); console.log('  ' + file);
};
/** what the speed bar shows now */
const barState = page => page.evaluate(() => {
  const g = window.__game, t = document.querySelector('[data-testid="speed-toggle"]'), box = t.parentElement;
  const ids = [...box.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid'));
  const cur = box.querySelector('[data-testid="speed-current"]');
  return { expanded: t.getAttribute('aria-expanded') === 'true', ids, speeds: ids.filter(i => /^speed-[0-9]/.test(i)).length, current: cur?.textContent ?? null, curPaused: cur ? cur.className.includes('opacity-70') : null, watch: ids.includes('watch-golf'), skip: [...box.querySelectorAll('button')].some(b => (b.getAttribute('data-tip') ?? '').startsWith('Skip to the next rush')), speed: g.speed, text: box.innerText.replace(/\s+/g, ' ').trim(), right: Math.round(box.getBoundingClientRect().right), left: Math.round(box.getBoundingClientRect().left) };
});

// ================================================================ the speed bar
async function speedPart() {
  console.log(`\n== the speed bar (${jam ? 'the jam build' : 'the normal game'}) ==`);
  const q = jam ? '' : '?start=range&seed=1';
  const { ctx, page } = await open({ width: 1366, height: 768 }, 1, q);
  await page.evaluate(() => window.__game.setSpeed(1)); await sleep(300);
  let s = await barState(page);
  console.log('  collapsed:', JSON.stringify({ ids: s.ids, current: s.current, text: s.text }));
  check(!s.expanded && s.speeds === 0 && !s.watch && !s.skip && s.current === '1×', 'collapsed by default: no speed chips, no Watch golf, no skip; the chip says the speed now (1×)');
  check(s.ids.includes('speed-toggle') && s.ids.includes('speed-current'), 'the chip and the chevron are there');
  await shotBar(page, `${tag}-1-collapsed`);

  // ---- the keys with the bar shut
  const speedNow = () => page.evaluate(() => window.__game.speed), chip = async () => (await barState(page)).current;
  await page.mouse.move(683, 400); await page.keyboard.press('.'); await sleep(250);
  check(await speedNow() === 2 && await chip() === '2×', `"." speeds up with the bar shut: 2× (the chip says ${await chip()})`);
  await page.keyboard.press('.'); await page.keyboard.press('.'); await sleep(250);
  check(await speedNow() === 8 && await chip() === '8×', `"." again twice: 8× (${await chip()})`);
  await page.keyboard.press(','); await sleep(250);
  check(await speedNow() === 4 && await chip() === '4×', `"," slows down with the bar shut: 4× (${await chip()})`);
  await page.keyboard.press(' '); await sleep(250);
  s = await barState(page);
  check(s.speed === 0 && s.curPaused === true && s.current === '4×', `Space pauses with the bar shut: the chip stays at the speed it resumes at, dimmed (${s.current}, paused ${s.curPaused})`);
  await shotBar(page, `${tag}-2-collapsed-paused`);
  await page.keyboard.press(' '); await sleep(250);
  check(await speedNow() === 4 && (await barState(page)).curPaused === false, 'Space again resumes at 4×');
  await page.keyboard.press(','); await page.keyboard.press(','); await page.keyboard.press(','); await page.keyboard.press(','); await page.keyboard.press(','); await page.keyboard.press(','); await sleep(250);
  check(await speedNow() === 1 / 40 && await chip() === '1/40×', `"," down to the slowest: 1/40× (${await chip()})`);
  await page.evaluate(() => window.__game.setSpeed(1)); await sleep(200);

  // ---- open: the chevron
  await page.click('[data-testid="speed-toggle"]'); await sleep(300);
  s = await barState(page);
  console.log('  open:', JSON.stringify({ speeds: s.speeds, watch: s.watch, skip: s.skip, text: s.text }));
  check(s.expanded && s.speeds === 9 && s.current === null, 'the chevron opens every speed (nine), the current-speed chip goes');
  check(jam ? !s.watch && !s.skip : s.watch && s.skip, jam ? 'the jam\'s bar: no Watch golf and no skip to the rush hour' : 'the game\'s bar: Watch golf and skip are there');
  check(await page.evaluate(() => document.querySelector('[data-testid="speed-1"]').className.includes('chip-on')), 'the running speed (1×) is the lit one');
  await shotBar(page, `${tag}-3-expanded`);
  await page.keyboard.press('.'); await sleep(250);
  check(await speedNow() === 2 && await page.evaluate(() => document.querySelector('[data-testid="speed-2"]').className.includes('chip-on')), '"." with the bar open: 2× lit');
  await page.click('[data-testid="speed-8"]'); await sleep(250);
  check(await speedNow() === 8, 'a speed chip still sets its speed (8×)');
  await page.evaluate(() => window.__game.setSpeed(1));

  // ---- remembered
  const stored = await page.evaluate(() => localStorage.getItem('capitalempire.speedBar'));
  check(stored === 'open', `the open state is remembered in this browser (${stored})`);
  await page.close();
  const again = await open(null, 1, q, ctx);
  s = await barState(again.page);
  check(s.expanded && s.speeds === 9, 'a new page of this browser opens the bar as it was left (open)');
  await again.page.click('[data-testid="speed-toggle"]'); await sleep(250);
  s = await barState(again.page);
  check(!s.expanded && s.speeds === 0 && await again.page.evaluate(() => localStorage.getItem('capitalempire.speedBar')) === 'closed', 'the chevron shuts it again, and that is remembered too (closed)');
  await again.page.close();
  const third = await open(null, 1, q, ctx);
  check(!(await barState(third.page)).expanded, 'and the next page starts collapsed');
  await ctx.close();

  // ---- the largest Text size on a small screen: nothing past the screen, no sideways scroll, collapsed and open
  for (const [W, H] of [[1366, 768], [1024, 700]]) {
    const big = await open({ width: W, height: H }, 1.25, q);
    for (const open_ of [false, true]) {
      if (open_) await big.page.click('[data-testid="speed-toggle"]');
      await sleep(400);
      const boxes = []; for (const b of await cluster(big.page).locator('button').all()) { const bb = await b.boundingBox(); if (bb) boxes.push(bb); }
      const r = await big.page.evaluate(() => { const bar = document.querySelector('[data-testid="speed-toggle"]').parentElement; return { vw: window.innerWidth, sw: document.documentElement.scrollWidth, bsw: document.body.scrollWidth, barSw: bar.scrollWidth, barCw: bar.clientWidth }; });
      r.right = Math.round(Math.max(...boxes.map(b => b.x + b.width))); r.left = Math.round(Math.min(...boxes.map(b => b.x))); r.buttons = boxes.length;
      console.log(`  ${W} x ${H} at 125% ${open_ ? 'open' : 'collapsed'}:`, JSON.stringify(r));
      check(r.right <= r.vw + 0.5 && r.left >= -0.5 && r.sw <= r.vw && r.bsw <= r.vw && r.barSw <= r.barCw + 1, `${W} x ${H}, Text size 125%, bar ${open_ ? 'open' : 'collapsed'}: every button inside the screen, no sideways scroll`);
      if (W === 1366) await shotBar(big.page, `${tag}-${open_ ? '5-expanded' : '4-collapsed'}-125pct`);
    }
    await big.ctx.close();
  }
}

// ================================================================ the cursor
async function cursorPart() {
  console.log(`\n== the map's pointer cursor (${jam ? 'the jam build' : 'the normal game, a grown town'}) ==`);
  const { ctx, page } = await open({ width: 1366, height: 768 }, 1, jam ? '' : '?fixture=range20');
  // the jam: buy the old range (its visitors walk the range), so the range, its practice area and people are there; the normal game's fixture is a grown town
  if (jam) { await page.evaluate(() => { const g = window.__game; g.buyRange?.(); g.setSpeed(1); }); }
  // a hole through the New hole wizard (the smoke test's way)
  const built = await page.evaluate(() => {
    const g = window.__game; g.paint.host.planLock = () => null;
    const P = g.golf.parcel, p = g.paint, w = p.wizard; g.setTool('course'); if (g.tool !== 'course') return 'no course tool';
    for (let y = P[1] + 20; y < P[1] + P[3] - 20; y += 30) for (let x = P[0] + 20; x < P[0] + P[2] - 20; x += 30) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const gx = x + dx * 60, gy = y + dy * 60; if (gx < P[0] + 10 || gy < P[1] + 10 || gx > P[0] + P[2] - 10 || gy > P[1] + P[3] - 10) continue;
      if (!p.setPlan()) return 'no plan'; p.pointerDown({ x, y }, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'green') { p.cancelPlan(); continue; }
      p.pointerDown({ x: gx, y: gy }, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'shape') { p.cancelPlan(); continue; }
      if (!w.check().ok) { p.cancelPlan(); continue; } p.buildPlan(); g.setTool('select'); return { x, y };
    }
    return 'no spot';
  });
  console.log('  hole built:', JSON.stringify(built));
  await page.evaluate(j => { const g = window.__game; g.setYouWalk(false); g.setSpeed(j ? 8 : 1); }, jam); await sleep(jam ? 12000 : 5000);
  await page.evaluate(() => window.__game.setSpeed(0));
  await sleep(300);
  // the practice area (the Build menu's Practice card places it): the engine's own placement, a spot on your land beside the range that it accepts
  const practice = await page.evaluate(() => {
    const g = window.__game, pl = g.practicePlaceable?.(), sc = g.range.scene; if (!pl || !sc) return 'not placeable here';
    for (let r = 6; r < 140; r += 6) for (let a = 0; a < 16; a++) {
      const x = Math.round(sc.counter.x + Math.cos(a * Math.PI / 8) * r), y = Math.round(sc.counter.y + Math.sin(a * Math.PI / 8) * r), rect = pl.spot(x, y);
      if (!pl.why(rect)) return pl.build(rect) ? `placed at ${rect.join(',')}` : 'refused';
    }
    return 'no spot';
  });
  console.log('  practice area:', practice);
  await sleep(600);
  const sceneInfo = await page.evaluate(() => { const g = window.__game, sc = g.range.scene; return { scene: !!sc, counter: sc ? { x: sc.counter.x, y: sc.counter.y } : null, practice: sc ? { x: sc.practice.label.x, y: sc.practice.label.y } : null, you: !!g.you, holes: g.golf.pins.length, parcel: g.golf.parcel }; });
  console.log('  game:', JSON.stringify(sceneInfo));

  // ---- the views to look at: the range (when there is one), the town's street, the hole
  const views = [];
  if (sceneInfo.scene) views.push({ name: 'the range', x: sceneInfo.counter.x, y: sceneInfo.counter.y, z: 0.2 });
  if (sceneInfo.scene && String(practice).startsWith('placed')) views.push({ name: 'the practice area', x: sceneInfo.practice.x, y: sceneInfo.practice.y, z: 0.2 });
  // (the fixture's town road runs along the top edge of your land: its lots, houses and people are seen from there)
  if (!jam) for (const dx of [-220, -120, -20, 80, 180, 280]) views.push({ name: `the town street ${dx}`, x: sceneInfo.parcel[0] + dx, y: sceneInfo.parcel[1] - 8, z: 0.2 });
  if (built && built.x !== undefined) views.push({ name: 'the hole', x: built.x, y: built.y, z: 0.2 });
  const found = {};
  const rows = []; let predictedOpen = 0, opened = 0; const mism = [], kinds = {};
  const snap = () => { const g = window.__game; return { range: g.range.cardOpen, club: g.clubCardOpen, staff: g.staffCardOpen, place: g.selectedPlace, sel: g.selected?.uid ?? null, hole: g.holeCardHole, talk: !!g.youTalk, scene: !!g.sceneRef, car: g.inspecting, tool: g.tool }; };
  const reset = () => { const g = window.__game; g.openRangeCard(false); g.openClubCard(false); g.openStaffCard(false); g.selectedPlace = null; g.selected = null; g.closeHoleCard(); g.youTalk = null; g.closeScene?.(); if (g.inspecting >= 0) g.closeInspect(); g.setTool('select'); g.setYouWalk(false); g.emit(); };
  for (const v of views) {
    await page.evaluate(([x, y, z]) => { const g = window.__game; g.setTool('select'); g.setYouWalk(false); g.lookAt(x, y, z); g.emit(); }, [v.x, v.y, v.z]);
    await sleep(500);
    // the things in this view, by their screen points: scanned over the screen with the engine's own picks
    const P = await page.evaluate(() => {
      const g = window.__game, d = g.dpr, sc = g.range.scene, out = {}, at = (x, y) => { const s = g.screen(x, y); return { x: Math.round(s.x / d), y: Math.round(s.y / d) }; };
      const clear = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && e.tagName === 'CANVAS' && e.classList.contains('touch-none'); };
      if (sc) { const r = at(sc.counter.x, sc.counter.y), p = at(sc.practice.label.x, sc.practice.label.y); if (clear(r.x, r.y) && g.range.hit(sc.counter.x, sc.counter.y)) out.range = r; if (clear(p.x, p.y) && g.range.hit(sc.practice.label.x, sc.practice.label.y)) out.practice = p; }
      for (let y = 100; y < 690; y += 8) for (let x = 130; x < 1240; x += 8) {
        if (!clear(x, y)) continue;
        const p = g.propAt(x, y, true), person = g.cam.z >= 0.12 && g.you ? g.youThingAt(x, y, true) : null, t = g.tileAt(x, y), h = g.courseHoleAt(t);
        if (!out.person && person?.kind === 'person') out.person = { x, y, name: person.name };
        if (!out.building && p && !p.auto?.startsWith('range:') && !p.plant && p.auto !== 'business-art') out.building = { x, y, auto: p.auto ?? '' };
        if (!out.hole && h > 0 && g.courseHoleViews()[h - 1]?.started && !p) out.hole = { x, y };
        if (!p && !person && !g.clickOpensAt(x, y) && !g.range.hit(t.x, t.y) && h === 0 && (!out.ground || Math.hypot(x - 683, y - 400) < out.ground.d)) out.ground = { x, y, d: Math.hypot(x - 683, y - 400) }; // (the open ground nearest the middle)
      }
      return out;
    });
    console.log(`  view ${v.name}: ${JSON.stringify(P)}`);
    for (const k of Object.keys(P)) if (!found[k]) found[k] = { ...P[k], view: v };
    // ---- the oracle: the engine's pick against a real click, over a grid of this view
    const grid = []; for (let y = 110; y < 680; y += 38) for (let x = 150; x < 1210; x += 38) grid.push([x, y]);
    let n = 0, mm = 0;
    for (const [x, y] of grid) {
      const pre = await page.evaluate(([x, y]) => { const g = window.__game; const e = document.elementFromPoint(x, y); if (!e || e.tagName !== 'CANVAS' || !e.classList.contains('touch-none')) return null; return { want: g.clickOpensAt(x, y), prop: g.propAt(x, y, true)?.auto ?? null }; }, [x, y]);
      if (!pre) continue;
      const before = await page.evaluate(snap);
      await page.mouse.click(x, y); await sleep(30);
      const after = await page.evaluate(snap);
      const did = after.range && !before.range || after.club && !before.club || after.staff && !before.staff || (after.place && after.place !== before.place) || (after.sel !== null && after.sel !== before.sel) || (after.hole !== null && after.hole !== before.hole) || (after.talk && !before.talk) || (after.scene && !before.scene) || (after.car >= 0 && after.car !== before.car) || after.tool !== before.tool;
      n++; rows.push(1); if (pre.want) predictedOpen++; if (did) opened++;
      if (did && after.range && !before.range && !found.range) found.range = { x, y, view: v }; // (a point a real click opened the range card from)
      if (did) { const k = after.range && !before.range ? 'range card' : after.club && !before.club ? 'club card' : after.staff && !before.staff ? 'staff card' : after.place && after.place !== before.place ? 'place card' : after.sel !== null && after.sel !== before.sel ? 'a prop selected' : after.hole !== null && after.hole !== before.hole ? 'a hole card' : after.talk && !before.talk ? 'a person' : after.scene && !before.scene ? 'a scene card' : after.car >= 0 && after.car !== before.car ? 'a car' : 'a tool change (bunker)'; kinds[k] = (kinds[k] ?? 0) + 1; }
      if (pre.want !== !!did) { mm++; mism.push({ view: v.name, x, y, predicted: pre.want, opened: !!did, prop: pre.prop, before, after }); }
      await page.evaluate(reset); await sleep(8);
    }
    console.log(`    oracle here: ${n} points, ${mm} differ`);
  }
  console.log(`  ORACLE: ${rows.length} points over ${views.length} views; the pick said "opens" at ${predictedOpen}, a real click opened something at ${opened}; kinds: ${JSON.stringify(kinds)}`);
  for (const m of mism.slice(0, 8)) console.log('   MISMATCH', JSON.stringify(m));
  check(rows.length > 100 && mism.length === 0, `the pick and a real click agree at every one of ${rows.length} points of the screen (${mism.length} differ)`);
  check(predictedOpen > 5 && predictedOpen < rows.length, 'the points include both kinds (some open a card, some do not)');

  // ---- the computed cursor over each kind of thing, Select in hand
  const cursorAt = async pt => { await page.evaluate(([x, y, z]) => window.__game.lookAt(x, y, z), [pt.view.x, pt.view.y, pt.view.z]); await sleep(350); await page.mouse.move(pt.x, pt.y); await sleep(200); return page.evaluate(() => { const c = document.querySelector('canvas.touch-none'); return { css: c.style.cursor, computed: getComputedStyle(c).cursor, opens: window.__game.hoverOpens }; }); };
  const isPointer = Object.assign(r => r.computed === 'pointer', { label: 'a pointer' }), isArrow = Object.assign(r => r.computed === 'default', { label: 'the default arrow' });
  await page.evaluate(() => { window.__game.setTool('select'); window.__game.setYouWalk(false); });
  const log = async (name, pt, want) => { if (!pt) { console.log(`  (no ${name} found in the views: not checked)`); return; } const r = await cursorAt(pt); console.log(`  ${name.padEnd(36)} -> ${short(r.computed)}  (opens ${r.opens})`); check(want(r), `${name}: ${want.label}`); };
  await log('Select, over a building', found.building, isPointer);
  await log('Select, over the range', found.range, isPointer);
  await log('Select, over the practice area', found.practice, isPointer);
  await log('Select, over a hole', found.hole, isPointer);
  await log('Select, over a person', found.person, isPointer);
  await log('Select, over open ground', found.ground, isArrow);
  const ref = found.building ?? found.range ?? found.hole;
  const tool = async (name, setup, want) => { await page.evaluate(setup); await sleep(250); const r = await cursorAt(ref); console.log(`  ${name.padEnd(36)} -> ${short(r.computed)}`); check(want(r), `${name}: ${want.label}`); };
  if (ref) {
    const cross = Object.assign(r => r.computed === 'crosshair', { label: 'its crosshair, not a pointer' });
    await tool('the road tool in hand', () => window.__game.setTool('road'), cross);
    await tool('the bulldozer in hand', () => window.__game.setTool('bulldoze'), cross);
    await tool('the Texture Painter in hand', () => { const g = window.__game; g.setTool('select'); g.openPropertyPaint(); }, Object.assign(r => r.computed !== 'pointer', { label: 'its brush cursor, not a pointer' }));
    await tool('Select in hand again', () => window.__game.setTool('select'), isPointer);
    await page.evaluate(() => window.__game.setYouWalk(true)); await sleep(250);
    if (found.ground) { const r = await cursorAt(found.ground); console.log(`  ${'Walk, over open ground'.padEnd(36)} -> ${short(r.computed)}`); check(/url\(.*svg/.test(r.computed), 'Walk keeps its footprints (a picture cursor)'); }
    if (found.person) { const r = await cursorAt(found.person); console.log(`  ${'Walk, over a person'.padEnd(36)} -> ${short(r.computed)}`); check(/url\(.*svg/.test(r.computed), 'Walk keeps its speech bubble over a person'); }
    if (found.building) { const r = await cursorAt(found.building); console.log(`  ${'Walk, over a building'.padEnd(36)} -> ${short(r.computed)}`); check(/url\(.*svg/.test(r.computed), 'Walk keeps its eye over a building'); }
    await page.evaluate(() => window.__game.setYouWalk(false));
  }

  // ---- the cost: the pick's time each frame while the pointer sweeps the map, and per call
  await page.evaluate(([x, y, z]) => { const g = window.__game; g.setTool('select'); g.lookAt(x, y, z); window.__pk = { n: 0, ms: 0, max: 0 }; const orig = g.pickHover.bind(g); g.pickHover = now => { const t = performance.now(); orig(now); const d = performance.now() - t; window.__pk.n++; window.__pk.ms += d; if (d > window.__pk.max) window.__pk.max = d; }; g.setSpeed(1); }, [views[0].x, views[0].y, views[0].z]);
  const t0 = Date.now(); let moves = 0;
  while (Date.now() - t0 < 4000) { const a = (Date.now() - t0) / 4000 * Math.PI * 12; await page.mouse.move(683 + 450 * Math.cos(a), 400 + 230 * Math.sin(a * 1.3)); moves++; }
  const pk = await page.evaluate(() => { const g = window.__game, o = window.__pk, perf = { fps: g.perf.fps, cpuMs: g.perf.cpuMs }; g.setSpeed(0); return { ...o, perf }; });
  console.log(`  the pick each frame while the pointer sweeps the map (${moves} moves in 4 s): ${pk.n} frames, mean ${(pk.ms / Math.max(1, pk.n) * 1000).toFixed(1)} µs a frame, worst ${(pk.max * 1000).toFixed(0)} µs; the frame: ${pk.perf.fps.toFixed(0)} fps, cpu ${pk.perf.cpuMs.toFixed(2)} ms`);
  check(pk.n > 20 && pk.ms / pk.n < 0.25 && pk.max < 4, `the pick costs ${(pk.ms / Math.max(1, pk.n) * 1000).toFixed(1)} µs a frame on average (worst ${(pk.max * 1000).toFixed(0)} µs): nothing noticeable`);
  const per = await page.evaluate(() => { const g = window.__game, N = 3000, pts = []; for (let i = 0; i < N; i++) pts.push([130 + Math.random() * 1100, 90 + Math.random() * 600]); const ts = []; for (const [x, y] of pts) { const t = performance.now(); g.clickOpensAt(x, y); ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return { mean: ts.reduce((s, v) => s + v, 0) / N, p50: ts[N >> 1], p95: ts[Math.floor(N * 0.95)], p99: ts[Math.floor(N * 0.99)], max: ts[N - 1] }; });
  console.log(`  clickOpensAt per call over 3000 random points: mean ${(per.mean * 1000).toFixed(1)} µs, p50 ${(per.p50 * 1000).toFixed(1)}, p95 ${(per.p95 * 1000).toFixed(1)}, p99 ${(per.p99 * 1000).toFixed(1)}, max ${(per.max * 1000).toFixed(0)} µs`);
  check(per.p95 < 0.5, `a pick costs ${(per.mean * 1000).toFixed(1)} µs on average, p95 ${(per.p95 * 1000).toFixed(1)} µs`);
  await ctx.close();
}

try {
  if (part === 'all' || part === 'speed') await speedPart();
  if (part === 'all' || part === 'cursor') await cursorPart();
} catch (e) {
  console.log('[script failed]', String(e.stack ?? e).split('\n').slice(0, 4).join(' | ')); bad++;
} finally {
  await browser.close();
}
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);

// #1281 (the owner, 2026-11-14: "when you place the practice area it should place some dirt greens we flags and a crappy bunker etc ... and then if you click on the practice are
// label it takes you to the window to build the proper green etc. the initial practice green you can place looks crap. remove the TEe box and make the bunker bigger. add some
// rough grass around the entire thing"): in-game check and shots of the practice area's starter set, the label's and the area's click, the build window, the first proper greens
// (Quick build) and the golf practice view's chipping green. On a new jam game (dev server run with VITE_JAM=1): buys the old range, places the practice area (a real click), looks
// at it close up, hovers and clicks its label (Walk) and its ground (Select), builds the chipping and the putting green over the starter set and takes the undo; each step's state
// is checked and printed, a failed check exits 1.
//   VITE_JAM=1 node node_modules/vite/bin/vite.js --port 5383 --strictPort      (a scratch port of your own)
//   node scripts/dev/practice-starter-shots.mjs --base http://127.0.0.1:5383/ --out docs/jam-shots --prefix practice-starter- --look desert [--dpr 1] [--seed 1]
//        [--steps area,label,window,chipping,putting,view]
// One headless Chrome, closed when done; a fresh profile, so the start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, has = k => args.includes(`--${k}`);
const base = opt('base', 'http://127.0.0.1:5383/'), out = opt('out', 'output/practice-shots'), look = opt('look', 'desert'), seed = opt('seed', '1'), prefix = opt('prefix', ''), dpr = Number(opt('dpr', '1'));
const steps = new Set(opt('steps', 'area,label,window,chipping,putting,view').split(','));
mkdirSync(out, { recursive: true });
const t0 = Date.now(), lap = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
/** waits for the ground bakes (chunks, the range's patches) and the bunker bakes to finish */
const settle = async (page, ms = 700) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForFunction(() => { const b = window.__game.ground.bunkers.stats; return !b.suspended && b.ready >= (window.__wantBunkers ?? 0); }, null, { timeout: 30000, polling: 100 }).catch(() => console.log('  (bunker bake wait timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name, clip) => {
  const file = join(out, `${prefix}${name}.jpg`), png = await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) });
  await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toFile(file);
  console.log('  ' + file);
};
const lookAt = (page, p, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [p.x, p.y, z]);
/** the pointer on world tile p (the camera already there): css px */
const screenOf = (page, p) => page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [p.x, p.y]);
const state = page => page.evaluate(() => { const g = window.__game, c = document.querySelector('canvas.touch-none'); return { card: g.range.cardOpen, selected: g.range.practiceSelected, tool: g.tool, walk: g.youWalkMode, hover: g.hoverPractice, cursor: c ? getComputedStyle(c).cursor : null }; });
const starterState = page => page.evaluate(() => { const g = window.__game, sc = g.range.scene, b = g.golf.range; return { save: b.starter ? { seed: b.starter.seed, gone: [...b.starter.gone] } : null, pieces: sc.starter.length, flags: sc.pieces.filter(p => p.key.startsWith('starter-flag')).length, patches: sc.patches.length, money: Math.round(g.money) }; });

try {
  const W = 1440, H = 900, ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr }), page = await ctx.newPage();
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase?.('ce'); } catch { /* none */ } });
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(`${base}${seed ? `?seed=${seed}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.locator('[data-testid="title-card"]').waitFor({ timeout: 240000 });
  lap('title card');
  await page.locator('[data-testid="title-new"]').click();
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  lap('game ready');
  const who = page.locator('button', { hasText: "That's me" });
  await who.waitFor({ timeout: 60000 });
  await page.locator('input[placeholder="Your name"]').fill('Shot Test').catch(() => {});
  const w = page.locator('button', { hasText: look === 'desert' ? 'Desert' : 'Autumn' }).first();
  if (await w.isVisible().catch(() => false)) await w.click();
  await who.click(); await page.waitForTimeout(800);
  await page.evaluate(() => { const g = window.__game, p = g.golf.progress; g.setSpeed(0); g.prebake = () => {}; window.__night = 0; g.nightAmount = () => window.__night; if (p?.tour) p.tour.off = true; g.emit(); });
  check(await page.evaluate(() => window.__game.desertTheme) === (look === 'desert'), `the world's look is ${look}`);
  // the old range stands for sale after the first view bakes: buy it
  await page.waitForFunction(() => { const g = window.__game; return !!g.range.scene && g.golf?.range?.forSale; }, null, { timeout: 120000 });
  await page.evaluate(() => { window.__game.money = Math.max(window.__game.money, 400000); });
  await page.evaluate(() => window.__game.buyRange());
  check(await page.evaluate(() => !window.__game.golf.range.forSale), 'the range is bought');
  // the practice area in hand, a spot for it (the nearest the car park's far side), a real click
  await page.evaluate(() => window.__game.placeRangePart('practice'));
  const spot = await page.evaluate(() => {
    const g = window.__game, p = g.placing; if (!p || p.id !== 'practice') return null;
    const sc = g.range.scene, c = sc.counter, best = [];
    for (let dy = -90; dy <= 90; dy += 2) for (let dx = -90; dx <= 90; dx += 2) {
      const s = p.spot(c.x + dx, c.y + dy); if (p.why(s)) continue;
      best.push({ x: c.x + dx, y: c.y + dy, d: Math.hypot(sc.carEdge.x - (s[0] + s[2] / 2), sc.carEdge.y - (s[1] + s[3] / 2)) });
    }
    best.sort((a, b) => a.d - b.d); return best[0] ?? null;
  });
  check(!!spot, `a spot for the practice area: ${JSON.stringify(spot)}`);
  if (!spot) throw new Error('no practice spot');
  await lookAt(page, spot, 0.1); await settle(page, 500);
  const before = await page.evaluate(() => ({ money: Math.round(window.__game.money) })), s0 = await screenOf(page, spot);
  await page.mouse.move(s0.x, s0.y); await page.mouse.click(s0.x, s0.y); await page.waitForTimeout(600);
  const placed = await page.evaluate(() => ({ money: Math.round(window.__game.money), at: window.__game.golf.range.practiceAt, placing: !!window.__game.placing }));
  check(!!placed.at && !placed.placing && before.money - placed.money === 5000, `the click placed the practice area for $5,000: ${JSON.stringify(placed)}`);
  let st = await starterState(page); console.log('  starter', JSON.stringify(st));
  check(!!st.save && st.save.gone.length === 0 && st.pieces === 4 && st.flags === 3, 'it came with its starter set: three dirt greens with flags and a bunker');
  lap('practice area placed');
  const area = await page.evaluate(() => { const a = window.__game.range.scene.practice; return { label: a.label, box: a.box }; });
  await page.mouse.move(8, 8); await page.waitForTimeout(4800);   // (the toasts go)
  await page.evaluate(() => window.__game.openRangeCard(false));
  if (steps.has('area')) {
    await lookAt(page, area.label, 0.3); await settle(page); await page.mouse.move(8, 8);
    await shot(page, `1-placed-${look}`);
  }
  if (steps.has('label')) {
    // Walk (the jam's default cursor): the pointer over the area shows the label and a hand; a click on the label opens the build window at once, no walk first
    await lookAt(page, area.label, 0.2); await settle(page, 500);
    const lp = await screenOf(page, area.label);
    await page.mouse.move(lp.x + 70, lp.y + 24); await page.waitForTimeout(150); await page.mouse.move(lp.x, lp.y); await page.waitForTimeout(450);
    const lab = await page.evaluate(() => { const g = window.__game, sc = g.range.scene; for (let i = 0; i < g.labels.n; i++) { const l = g.labels.list[i]; if (l.key === sc.practice && l.shown) return { px: l.px / g.dpr, py: l.py / g.dpr, text: l.text }; } return null; });
    check(!!lab && lab.text === 'Practice area', 'the area\'s name shows on hover (labels show on hover only)');
    st = await state(page); check(st.hover && /pointer|data:image/.test(st.cursor ?? ''), `a hand over the area in Walk (${st.walk})`);
    await shot(page, `2-label-hover-${look}`);
    await page.mouse.click(lab ? lab.px : lp.x, lab ? lab.py : lp.y); await page.waitForTimeout(800);
    st = await state(page); check(st.card && st.selected, 'Walk: a click on the label opens the build window at once, the area selected');
    await settle(page, 600); await page.waitForTimeout(700);
    const card = await page.evaluate(() => { const c = document.querySelector('[data-testid="range-card"]'), b = document.querySelector('[data-testid="range-practice"]'); if (!c || !b) return null; const cr = c.getBoundingClientRect(), br = b.getBoundingClientRect(); return { top: Math.round(c.scrollTop), at: Math.round(br.top - cr.top), shown: br.top >= cr.top && br.top < cr.bottom - 80 }; });
    check(!!card && card.shown && card.top > 0, `the card scrolled to its Practice facilities: ${JSON.stringify(card)}`);
    const btns = await page.evaluate(() => [...document.querySelectorAll('[data-testid="range-practice"] button')].map(b => b.textContent.trim()));
    check(['Show area', 'Quick build', 'Build'].every(b => btns.includes(b)), `the window offers ${btns.join(', ')}`);
    if (steps.has('window')) { await page.mouse.move(8, 8); await page.waitForTimeout(500); await shot(page, `3-window-from-label-${look}`); }
    await page.evaluate(() => window.__game.openRangeCard(false));
    st = await state(page); check(!st.card && !st.selected, 'closing the card puts the selection away');
    // Select: a pointer cursor over the area and a click on its ground opens the window
    await page.evaluate(() => window.__game.setYouWalk(false)); await page.waitForTimeout(200);
    await page.mouse.move(lp.x + 170, lp.y + 70); await page.waitForTimeout(350);
    st = await state(page); check(st.hover && st.cursor === 'pointer', `Select: a pointer over the area (${st.cursor})`);
    await page.mouse.move(W - 400, H - 30); await page.waitForTimeout(250);
    st = await state(page); check(!st.hover && st.cursor !== 'pointer', `and not off it (${st.cursor})`);
    await page.mouse.move(lp.x + 170, lp.y + 70); await page.mouse.click(lp.x + 170, lp.y + 70); await page.waitForTimeout(600);
    st = await state(page); check(st.card && st.selected, 'Select: a click on the area opens the window');
    await page.evaluate(() => { window.__game.openRangeCard(false); window.__game.setYouWalk(true); });
    await page.mouse.move(8, 8);
  }
  const buildOne = async (kind, name) => {
    await page.evaluate(() => { const g = window.__game; g.armPractice(null); g.setTool('select'); g.openRangeCard(false); });
    const b = await starterState(page), r = await page.evaluate(k => window.__game.quickPractice(k), kind);
    check(r === null, `quick build ${kind}: ${r === null ? 'built' : r}`);
    if (kind === 'chipping') await page.evaluate(() => { window.__wantBunkers = 1; });
    await page.waitForTimeout(500);
    const a = await starterState(page), info = await page.evaluate(k => { const f = window.__game.range.practice?.[k]; return f ? { state: f.state, m2: f.m2, centre: f.centre, cups: f.cups.length } : null; }, kind);
    console.log('  ', kind, JSON.stringify(info), 'starter before', JSON.stringify(b.save), 'after', JSON.stringify(a.save));
    check(info?.state === 'open', `${kind} opens (${info?.m2} m²)`);
    await settle(page, 1200);
    if (info?.centre) { await lookAt(page, info.centre, 0.3); await settle(page, 800); await page.mouse.move(8, 8); await shot(page, `${name}-${look}`); }
    return { b, a, info };
  };
  let chip = null;
  if (steps.has('chipping')) chip = await buildOne('chipping', '4-first-green');
  if (steps.has('putting')) await buildOne('putting', '5-putting-green');
  if (chip && chip.a.save.gone.length) {
    // the build's undo step brings back the starter pieces it replaced (and the money), redo takes them away again
    await page.evaluate(() => window.__game.paint.undo()); await page.waitForTimeout(300);
    const u = await starterState(page); check(u.save.gone.length === 0 && u.flags === chip.b.flags && u.patches === chip.b.patches, `undo brings the starter pieces back: ${JSON.stringify(u.save)}`);
    await page.evaluate(() => window.__game.paint.redo()); await page.waitForTimeout(300);
    const r = await starterState(page); check(JSON.stringify(r.save.gone) === JSON.stringify(chip.a.save.gone), 'redo replaces them again');
  }
  if (steps.has('view')) {
    // the golf practice view finds the chipping green (J6: Chip and putt)
    const why = await page.evaluate(() => window.__game.practice3pWhy('short'));
    check(why === null, `Chip and putt can open: ${why}`);
    await page.evaluate(() => window.__game.openPractice3p('short')); await page.waitForTimeout(10000);
    const open = await page.evaluate(() => ({ hole: window.__game.view3pHole, place: window.__game.practice3pPlace }));
    check(open.hole === 2 && open.place === 'short', `the view is open on the chipping green: ${JSON.stringify(open)}`);
    await shot(page, `6-chip-and-putt-view-${look}`);
  }
  lap('done');
} finally {
  if (!has('keep')) await browser.close().catch(() => {});
}
console.log(bad ? `${bad} check(s) FAILED` : 'all checks ok');
process.exit(bad ? 1 : 0);

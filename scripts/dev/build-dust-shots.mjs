// #1373 (the owner, 2026-11-15: "we need to add the dust that happens when you draw a road on EVERYTHING you build"): frames of the construction dust
// (src/game/build-dust.ts) in a real browser on a dev server of your own, and the checks that it stays quiet where it must:
//   load       a new game loads and its first view bakes: no dust (the pool's most live particles stays 0)
//   building   the clubhouse placed (its ghost's own spot finder, then the click): a ring of dust round it
//   range      a range upgrade placed (Target greens, then 8 hitting bays): dust along each piece
//   brush      the natural-props brush: a stroke of bushes (one undoable step a dab): a light, throttled puff per piece
//   hole       Course > Holes > New hole, a tee and a green, the map's BUILD NOW: dust along the hole's edges
//   paint      a painted stroke (the Texture Painter's dab, as the bench paints): a light trail along it
//   undo       the paint undone and redone: no dust
//   jam        (--jam: a VITE_JAM=1 dev server) the title card's scene: no dust while it plays
//   node scripts/dev/build-dust-shots.mjs --base http://127.0.0.1:PORT/ [--out F:/ClaudeTemp/jam/dust] [--headed] [--jam]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', ''); if (!base) { console.error('--base http://127.0.0.1:PORT/ (a dev server of your own)'); process.exit(2); }
const JAMRUN = has('jam'), OUT = resolve(opt('out', 'F:/ClaudeTemp/jam/dust')); mkdirSync(OUT, { recursive: true });
const fails = [], errors = [];
const check = (ok, what, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!ok) fails.push(what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, acceptDownloads: false });
await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__dust')) { localStorage.clear(); indexedDB.deleteDatabase?.('capital-empire'); sessionStorage.setItem('__dust', '1'); } } catch { /* none */ } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|Failed to load resource|ResizeObserver/.test(t)) errors.push(`console: ${t.slice(0, 240)}`); });
page.on('dialog', d => d.dismiss().catch(() => {}));
const game = (fn, arg) => page.evaluate(([f, a]) => (0, eval)(`(${f})`)(window.__game, a), [fn.toString(), arg]);

/** watches the dust pool every frame: the most particles alive since the last reset */
const watch = () => page.evaluate(() => {
  window.__dustMax = 0; if (window.__dustWatch) return; window.__dustWatch = 1; window.__dustWho = {};
  // which hook puffed: the caller of BuildDust.rect / poly / grid, and the road builder's puff, counted since the last reset
  const g = window.__game, d = g.dust;
  const tag = m => { const s = (new Error().stack || '').split('\n')[3]?.trim().split(' ')[1] ?? '?', k = `${m} from ${s}`; window.__dustWho[k] = (window.__dustWho[k] || 0) + 1; };
  for (const m of ['rect', 'poly', 'grid']) { const o = d[m].bind(d); d[m] = (...a) => { tag(m); return o(...a); }; }
  const op = g.puff.bind(g); g.puff = (...a) => { tag('road puff'); return op(...a); };
  const f = () => { window.__dustMax = Math.max(window.__dustMax, g.dust.pool.n); requestAnimationFrame(f); }; requestAnimationFrame(f);
});
const dustMax = () => page.evaluate(() => window.__dustMax ?? 0);
const resetMax = () => page.evaluate(() => { window.__dustMax = 0; window.__dustWho = {}; });
const who = () => page.evaluate(() => JSON.stringify(window.__dustWho ?? {}));
const live = () => game(g => g.dust.pool.n);
const quiet = async () => { for (let k = 0; k < 40 && (await live()) > 0; k++) await sleep(100); };
/** the map picture now (the UI hidden) */
async function shot(name) {
  const h = await page.addStyleTag({ content: '[data-testid="build-now"], .toast, [role="status"] { visibility: hidden !important }' });
  const f = resolve(OUT, `${JAMRUN ? 'jam-' : ''}${name}.png`); await page.screenshot({ path: f, type: 'png' }); await h.evaluate(e => e.remove()); console.log(`  shot ${f}`);
}
/** three frames of the dust after an action: at once, 0.3 s and 0.6 s */
/** the camera on the live dust (its middle), so the frames show it wherever the new thing stands */
const focusDust = () => game(g => { const P = g.dust.pool; if (!P.n) return; let x = 0, y = 0; for (let i = 0; i < P.n; i++) { x += P.items[i].x; y += P.items[i].y; } g.camEase = null; g.lookAt(x / P.n, y / P.n, Math.max(g.cam.z, 0.3)); g.emit(); });
async function frames(name) { await focusDust(); await shot(`${name}-a`); await sleep(150); await shot(`${name}-b`); await sleep(200); await shot(`${name}-c`); }
const look = (p, z) => game((g, a) => { g.camEase = null; g.lookAt(a.x, a.y, a.z ?? g.cam.z); g.emit(); }, { ...p, z });
const scr = p => game((g, a) => { const q = g.screen(a.x, a.y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, p);

async function start() {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 240000 });
  if (JAMRUN) {
    await page.locator('[data-testid="title-card"]').waitFor({ timeout: 240000 });
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); await watch();
    await sleep(6000);
    const m = await dustMax(), show = await game(g => g.show);
    check(m === 0, 'the title card\'s scene plays with no dust', `show ${show}, most live ${m}`);
    await shot('00-title-scene');
    await page.locator('[data-testid="title-new"]').click(); await sleep(1200);
  }
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); await watch(); await resetMax();
  await page.waitForFunction(() => window.__game.firstViewBaked, null, { timeout: 180000 }).catch(() => console.log('  (the first view never counted as baked)'));
  await sleep(1500);
  check((await dustMax()) === 0, 'no dust while the game loads and its first view bakes', `most live ${await dustMax()} ${await who()}`);
  const go = page.locator('[data-testid="who-go"]'); await go.waitFor({ timeout: 90000 });
  await page.locator('[data-testid="who-name"]').fill('Dust').catch(() => {});
  await resetMax(); await go.click(); await sleep(1500);
  if (await page.locator('[data-testid="start-pick-card"]').count()) {
    await sleep(1200); await page.locator('[data-testid="start-pick-auto"]').click();
    await page.waitForFunction(() => window.__game.golf?.range?.home && !window.__game.startPick, null, { timeout: 90000 });
  }
  await sleep(2500);
  for (let k = 0; k < 3; k++) {
    const off = page.locator('[data-testid="tour-off"]'); if (await off.count() && await off.isVisible().catch(() => false)) { await off.click().catch(() => {}); await sleep(300); }
    const wc = page.locator('[data-testid="welcome-card"] [aria-label="Close"]'); if (await wc.count()) { await wc.first().click().catch(() => {}); await sleep(300); }
  }
  const st = await game(g => ({ armed: g.dust.arm.armed, n: g.dust.pool.n, lots: g.lotQueue.size }));
  check((await dustMax()) === 0, 'no dust while the new game\'s start is laid and bakes', `most live ${await dustMax()}, armed ${st.armed}, lot queue ${st.lots} ${await who()}`);
  await game(g => { g.setSpeed(0); g.traffic.money = Math.max(g.traffic.money ?? 0, 5e6); g.money = Math.max(g.money ?? 0, 5e6); g.emit(); });
  await page.waitForFunction(() => window.__game.dust.arm.armed, null, { timeout: 60000 }).catch(() => {});
  check(await game(g => g.dust.arm.armed), 'the dust is armed once the load has settled');
}
const home = () => game(g => { const [x, y, w, d] = g.golf.range.home; return { x: x + w / 2, y: y + d / 2 }; });

async function building() {
  const h = await home();
  const spot = await game((g, h) => {
    g.setTool('course'); g.placeClubhouse(true);
    for (let r = 10; r <= 140; r += 4) for (let a = 0; a < 360; a += 15) {
      const t = { x: h.x + Math.cos(a * Math.PI / 180) * r, y: h.y + Math.sin(a * Math.PI / 180) * r };
      g.clubUpdate(0, 0, t); const b = g.bizHover; if (b && b.def.type === 'clubhouse' && !b.why) return { x: b.def.x + b.def.w / 2, y: b.def.y + b.def.h / 2, t };
    }
    return { why: g.bizHover?.why ?? 'no hover' };
  }, h);
  if (!spot.t) { check(false, 'the clubhouse finds a spot', spot.why); await game(g => { g.placeClubhouse(false); g.setTool('select'); }); return; }
  await look(spot, 0.3); await sleep(800); await quiet(); await resetMax();
  const before = await game(g => g.bizDefs.length);
  await game((g, s) => { g.clubUpdate(0, 0, s.t); g.clubClick(); }, spot);
  await frames('building-clubhouse');
  const after = await game(g => g.bizDefs.length), m = await dustMax();
  check(after > before, 'the clubhouse is built');
  check(m >= 30, 'a ring of dust round the clubhouse', `most live ${m}`);
  await game(g => { g.placeClubhouse(false); g.setTool('select'); g.emit(); });
}

async function range() {
  for (const id of ['greens', 'bays8']) {
    const c = await game((g, id) => { const sc = g.range.scene, b = sc?.front ?? sc?.box; if (!b) return null; g.buyRangeUpgrade(id); return g.placing ? { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 } : null; }, id);
    if (!c) { check(false, `the range upgrade ${id} is in hand`); continue; }
    await look(c, 0.3); await sleep(800); await quiet(); await resetMax();
    const s = await scr(c); await page.mouse.move(s.x - 10, s.y - 8); await page.mouse.move(s.x, s.y, { steps: 3 }); await sleep(200);
    await page.mouse.down(); await page.mouse.up();
    await frames(`range-${id}`);
    const m = await dustMax(), owned = await game((g, id) => !!g.golf.range.upgrades?.includes?.(id) || !!g.golf.range.owned?.includes?.(id) || !g.placing, id);
    check(owned, `the range upgrade ${id} is placed`);
    check(m >= 6, `dust along the range upgrade ${id}`, `most live ${m}`);
    await game(g => { g.placing = null; g.emit(); });
  }
}

async function brush() {
  const h = await home(), c = { x: h.x - 30, y: h.y + 30 };
  await look(c, 0.3); await sleep(800); await quiet(); await resetMax();
  const ids = await game(g => g.plantPool('bushes').slice(0, 6).map(it => it.id ?? it));
  // a stroke: 14 dabs 0.08 s apart, each its own step (as each brush press is undoable)
  for (let k = 0; k < 14; k++) {
    await game((g, a) => g.paint.step('Plant bushes', () => g.plantProps(a.ids, a.x, a.y, 2.2, 1.2, [0.8, 1.1], 77 + a.k)), { ids, x: c.x - 9 + k * 1.3, y: c.y - 4 + k * 0.6, k });
    if (k === 3) await shot('brush-bushes-a');
    if (k === 8) await shot('brush-bushes-b');
    await sleep(80);
  }
  await shot('brush-bushes-c');
  const m = await dustMax(), planted = await game(g => g.plantedCount());
  check(planted > 0, 'the brush planted bushes', `${planted}`);
  check(m > 0 && m <= 260, 'a light, throttled puff per piece (no flood)', `most live ${m}`);
}

async function hole() {
  const h = await home();
  const pair = await game((g, near) => {
    const w = g.paint.wizard, far = () => ({ x: 1e9, y: 1e9 }); g.setTool('course'); g.paint.setPlan();
    const cand = []; for (let ux = -170; ux <= 230; ux += 10) for (let vy = -170; vy <= 330; vy += 10) cand.push({ x: near.x + ux - 30, y: near.y + vy - 60 });
    cand.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
    for (const t of cand) for (const [dx, dy] of [[0, 75], [0, -75], [75, 0], [-75, 0]]) {
      w.start(w.hole); w.press(t, -1e5, -1e5, far); if (w.step !== 'green') continue;
      w.press({ x: t.x + dx, y: t.y + dy }, -1e5, -1e5, far); if (w.step !== 'shape') continue;
      const c = w.check(); if (c.ok && c.ghost && !c.ghost.refused) return { tee: t, green: { x: t.x + dx, y: t.y + dy } };
    }
    return null;
  }, h);
  if (!pair) { check(false, 'the land has room for a hole'); return; }
  const mid = { x: (pair.tee.x + pair.green.x) / 2, y: (pair.tee.y + pair.green.y) / 2 };
  await look(mid, 0.2); await sleep(1500);
  const bn = page.locator('[data-testid="build-now"] button');
  if (!(await bn.count())) { check(false, 'the map\'s BUILD NOW shows for the planned hole'); return; }
  await quiet(); await resetMax();
  await bn.first().click();
  await frames('hole-build-now');
  await sleep(300); await shot('hole-build-now-d');
  const m = await dustMax(), built = await game(g => new Set((g.golf?.pins ?? []).map(p => p.hole)).size);
  check(built >= 1, 'BUILD NOW built the hole');
  check(m >= 30, 'dust along the hole\'s edges', `most live ${m}`);
  await quiet(); await resetMax();
  await game(g => g.paint.undo()); await sleep(700); await shot('hole-undone');
  const gone = await game(g => new Set((g.golf?.pins ?? []).map(p => p.hole)).size);
  await game(g => g.paint.redo()); await sleep(700); await shot('hole-redone');
  const back = await game(g => new Set((g.golf?.pins ?? []).map(p => p.hole)).size), u = await dustMax();
  check(gone < built && back === built, 'the hole is undone and redone', `${built} > ${gone}, then ${back}`);
  check(u === 0, 'no dust when the hole is undone and redone', `most live ${u} ${await who()}`);
  await game(g => { g.setTool('select'); g.emit(); });
}

async function paint() {
  const h = await home(), c = { x: h.x + 40, y: h.y - 30 };
  await look(c, 0.3); await sleep(800); await quiet(); await resetMax();
  for (let k = 0; k < 16; k++) {
    await game((g, a) => g.courseDab(a.x, a.y, a.x + 0.8, a.y + 0.4, 2.5, 1), { x: c.x - 10 + k, y: c.y - 3 + k * 0.4 });
    if (k === 5) await shot('paint-stroke-a');
    if (k === 11) await shot('paint-stroke-b');
    await sleep(60);
  }
  await shot('paint-stroke-c');
  const m = await dustMax();
  check(m > 0 && m <= 200, 'a light trail of dust along the painted stroke', `most live ${m}`);
}

try {
  await start();
  if (!JAMRUN) { await building(); await range(); await brush(); await hole(); await paint(); }
  else { await range(); await paint(); }
} catch (e) { fails.push(`threw: ${e.message}`); console.log(`FAIL threw: ${e.stack}`); }
for (const e of errors.slice(0, 12)) console.log(`  ${e}`);
console.log(`${fails.length ? 'FAILED' : 'ALL PASS'}: ${fails.length} failed; ${errors.length} page errors`);
await browser.close();
process.exit(fails.length ? 1 : 0);

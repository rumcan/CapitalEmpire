// #1297 (the owner, 2026-11-14: "goals cover menu ui. cant be closed either"): the Goal pill in the game as a player sees it. The pill is part of the top bar: a small chip in the bar,
// and the full pill in a row of the bar under it while it is open. For each screen size (1280 x 720 and 1366 x 768, the Text size 100% and the largest, 125%) this opens a new normal game
// and checks the chip is in the bar's first row and does not make the bar wrap, opens the pill (the chip's click) and checks it is in the bar, whole on the screen, readable, and clear of
// every panel, flyout, card and the rail; opens the Course panel and a flyout and checks the pill covers none of them; reloads and checks the choice was remembered; takes the shots. --jam
// (the jam build's dev server): neither the chip nor the pill is there.
//   node scripts/dev/goal-pill-shots.mjs --base http://127.0.0.1:5733/ [--jam] [--out docs/ui-shots] [--sizes 1280x720,1366x768] [--scales 1,1.25] [--no-shots]
// One headless Chrome, closed when done. Prints ok/FAIL per check (exit 1 on a FAIL). Saves are not written.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5733/'), jam = has('jam'), out = opt('out', 'output/goal-pill-shots'), noShots = has('no-shots');
const sizes = opt('sizes', '1280x720,1366x768').split(',').map(s => s.split('x').map(Number)), scales = opt('scales', '1,1.25').split(',').map(Number);
mkdirSync(out, { recursive: true });
const t0 = Date.now(), lap = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`), sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; return ok; };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const shot = async (page, name, clip) => { if (noShots) return; await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 8000 }).catch(() => {}); const f = join(out, `${name}.jpg`), png = await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) }); await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toFile(f); console.log('  ' + f); };

/** a new game of this build, the start laid, the tutorial off (it is on a card of its own), the clock stopped; scale: Settings' Text size, in the browser's storage as a player sets it */
async function boot(W, H, scale, ctx0) {
  const ctx = ctx0 ?? await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: false });
  // (the storage is cleared once per session: a reload keeps what the page saved, as a player's browser does)
  if (!ctx0) await ctx.addInitScript(s => { try { if (!sessionStorage.getItem('__gp')) { localStorage.clear(); indexedDB.deleteDatabase?.('ce'); sessionStorage.setItem('__gp', '1'); if (s !== 1) localStorage.setItem('capitalempire.uiScale', String(s)); } } catch { /* none */ } }, scale);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}${jam ? '' : '?fixture=range20'}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await bringUp(page);
  return { ctx, page };
}
/** a loaded page up as a new game: the title card (jam), Who are you, the start laid, the tutorial off, the clock stopped */
async function bringUp(page) {
  if (jam) { await page.locator('[data-testid="title-card"]').waitFor({ timeout: 240000 }); await page.locator('[data-testid="title-new"]').click(); }
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); });
  if (jam) { const who = page.locator('button', { hasText: "That's me" }); await who.waitFor({ timeout: 90000 }); await who.click(); } else await page.evaluate(() => window.__game.closeWho('Tester', 2));
  await page.waitForFunction(() => window.__game.firstViewBaked, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; if (g.startPick) g.startPickAuto(); });
  await page.waitForFunction(() => !!window.__game.range?.scene, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game, p = g.golf.progress; g.setSpeed(0); for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; g.setAdvancedTools(true); g.closeWelcome?.(false); g.emit(); });
  await sleep(1500);
}
/** the boxes that matter now: the bar, its chip and row, the pill, and every panel, flyout column, card and the rail (window css px) */
const measure = page => page.evaluate(() => {
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom } : null; };
  const bar = document.querySelector('[data-tb-tier]'), pill = document.querySelector('[data-testid="goal-chip"]'), chip = document.querySelector('[data-testid="goal-toggle"]');
  const others = {};
  for (const [k, sel] of [['rail', '[data-testid="rail"]'], ['panel', '[data-testid="tool-panel"]'], ['guide', '[data-testid="range-guide"]'], ['range card', '[data-testid="range-card"]'], ['footer', '[data-testid="rail-footer"]'], ['minimap', '[data-testid="minimap"]']]) { const b = r(document.querySelector(sel)); if (b) others[k] = b; }
  document.querySelectorAll('[data-flyout-col]').forEach((c, i) => { const b = r(c); if (b) others[`flyout ${i}`] = b; });
  const kids = [...(bar?.children ?? [])].map(r);
  return { hud: parseFloat(document.documentElement.style.getPropertyValue('--hud-top')) || 0, bar: r(bar), kids, chip: r(chip), row: r(document.querySelector('[data-testid="goal-row"]')), pill: r(pill), fold: r(document.querySelector('[data-testid="goal-fold"]')), others,
    pillText: pill?.textContent ?? null, pillFont: pill ? parseFloat(getComputedStyle(pill).fontSize) : null, pillOverflow: pill ? pill.scrollWidth - pill.clientWidth : null, vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth };
});
const meets = (a, b, pad = 0) => !!a && !!b && a.x < b.r + pad && a.r + pad > b.x && a.y < b.b + pad && a.b + pad > b.y;

try {
  if (jam) {
    const { ctx, page } = await boot(1366, 768, 1);
    const m = await measure(page);
    check(!m.chip && !m.pill && !m.row, 'the jam build has no goal: no chip, no pill, no row');
    check((await page.locator('[data-testid="finlit-goal"]').count()) === 0, 'and no goal element anywhere');
    await ctx.close();
  } else for (const [W, H] of sizes) for (const scale of scales) {
    const tagS = `${W}x${H} @${Math.round(scale * 100)}%`, pct = Math.round(scale * 100), name = k => `goal-pill-${k}-${W}x${H}-${pct}pct`;
    const { ctx, page } = await boot(W, H, scale);
    lap(`${tagS}: game ready`);
    // ---- folded (the default): the chip is in the bar's first row, and does not make the bar wrap
    let m = await measure(page);
    check(!!m.chip && !m.row && !m.pill, `${tagS}: folded by default: the chip in the bar, no pill`);
    const row0 = Math.round(m.kids[0]?.y ?? 0);
    check(!!m.chip && m.chip.y < row0 + (m.kids[0]?.h ?? 0) && m.chip.b > row0, `${tagS}: the chip is in the bar's first row (${Math.round(m.chip?.x ?? 0)},${Math.round(m.chip?.y ?? 0)} ${Math.round(m.chip?.w ?? 0)}x${Math.round(m.chip?.h ?? 0)})`);
    // (hide the chip: does the bar's row count change?)
    const rowsWith = m.hud; await page.evaluate(() => { document.querySelector('[data-testid="goal-toggle"]').style.display = 'none'; }); await sleep(300);
    const rowsWithout = (await measure(page)).hud; await page.evaluate(() => { document.querySelector('[data-testid="goal-toggle"]').style.display = ''; }); await sleep(300);
    check(Math.abs(rowsWith - rowsWithout) < 2, `${tagS}: the chip does not make the bar wrap (the bar's bottom ${rowsWithout} without it, ${rowsWith} with it)`);
    check(m.scrollW <= m.vw, `${tagS}: no horizontal scroll`);
    await shot(page, name('1-folded'), { x: 0, y: 0, width: W, height: Math.min(H, 330) });
    // ---- unfolded: the chip's click opens the pill under the bar
    await page.locator('[data-testid="goal-toggle"]').click(); await sleep(600);
    m = await measure(page);
    check(!!m.row && !!m.pill, `${tagS}: a click on the chip opens the pill in a row of the bar`);
    check(!!m.pill && !!m.bar && m.pill.y >= m.kids[0].b - 2 && m.pill.b <= m.bar.b + 1, `${tagS}: the pill stands in the bar, under its first row (bar bottom ${Math.round(m.bar?.b ?? 0)}, pill ${Math.round(m.pill?.y ?? 0)}..${Math.round(m.pill?.b ?? 0)})`);
    check(!!m.pill && m.pill.x >= 0 && m.pill.r <= W - 4 && m.pillOverflow <= 1, `${tagS}: the pill is whole on the screen (${Math.round(m.pill?.x ?? 0)}..${Math.round(m.pill?.r ?? 0)} of ${W}, overflow ${m.pillOverflow})`);
    check((m.pillFont ?? 0) >= 11.5, `${tagS}: its text is ${m.pillFont}px (the Text size scales it: ${pct}%)`);
    check(m.hud * scale >= m.pill.b - 8, `${tagS}: the rail and the panels start under it (--hud-top ${Math.round(m.hud)} UI px = ${Math.round(m.hud * scale)} on the screen, pill bottom ${Math.round(m.pill.b)})`);
    check(Object.entries(m.others).every(([, b]) => !meets(m.pill, b)), `${tagS}: the pill covers no panel, rail, flyout or card (${Object.keys(m.others).join(', ')})`);
    await shot(page, name('2-unfolded'), { x: 0, y: 0, width: W, height: Math.min(H, 330) });
    // ---- with a panel and a flyout open: the pill covers neither
    await page.evaluate(() => { const g = window.__game; g.setTool('course'); g.emit(); }); await sleep(700);
    m = await measure(page);
    check(!!m.others.panel && !meets(m.pill, m.others.panel), `${tagS}: the Course panel is open and the pill is clear of it (panel top ${Math.round(m.others.panel?.y ?? 0)}, pill bottom ${Math.round(m.pill?.b ?? 0)})`);
    check(!!m.others.rail && !meets(m.pill, m.others.rail) && Object.entries(m.others).every(([, b]) => !meets(m.pill, b)), `${tagS}: nor the rail, nor a card`);
    await shot(page, name('3-panel-open'), { x: 0, y: 0, width: Math.min(W, 760), height: Math.min(H, 560) });
    await page.click('[data-rail="course"]'); await sleep(700);
    m = await measure(page);
    check(Object.entries(m.others).every(([, b]) => !meets(m.pill, b)), `${tagS}: with the Course flyout open the pill covers none of ${Object.keys(m.others).join(', ')}`);
    await shot(page, name('4-flyout-open'), { x: 0, y: 0, width: Math.min(W, 900), height: Math.min(H, 560) });
    await page.keyboard.press('Escape'); await sleep(200);
    // ---- the pill's own buttons: Fold folds it; the chip opens it again
    await page.locator('[data-testid="goal-fold"]').click(); await sleep(500);
    m = await measure(page); check(!m.row && !!m.chip, `${tagS}: Fold puts the pill away: the chip alone`);
    await page.locator('[data-testid="goal-toggle"]').click(); await sleep(400);
    m = await measure(page); check(!!m.row, `${tagS}: the chip opens it again`);
    // ---- the report card still opens from the pill
    await page.locator('[data-testid="goal-chip"]').click(); await sleep(500);
    check((await page.locator('[data-testid="report-card"]').count()) === 1, `${tagS}: a click on the pill opens the report card`);
    await page.keyboard.press('Escape'); await page.locator('[data-testid="report-card"] button').first().click().catch(() => {}); await sleep(300);
    // ---- remembered: open when the page is loaded again
    await page.reload({ waitUntil: 'domcontentloaded' });
    await bringUp(page);
    const stored = await page.evaluate(() => { try { return localStorage.getItem('capitalempire.goalPill'); } catch { return null; } });
    const after = await measure(page);
    check(stored === 'open', `${tagS}: the browser's storage keeps it (capitalempire.goalPill: ${stored})`);
    check(!!after.chip, `${tagS}: after a reload the game is up with the chip`);
    check(!!after.row, `${tagS}: and the pill is open as it was left (remembered in this browser)`);
    await ctx.close();
  }
} catch (e) { console.log('[script failed]', String(e.stack ?? e).split('\n').slice(0, 4).join(' | ')); bad++; }
finally { await browser.close(); }
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);

// T459 (the owner, 2026-11-13: "tutorial has a The Bank with a Show me button that does nothing? are you guys not testing buttons?"): the jam build's
// button smoke test. Serves dist-jam (npm run build:jam first) on a free port, opens it in the installed Chrome (playwright-core, channel 'chrome',
// headless with WebGL), starts a fresh game and clicks every visible button of the jam UI in turn: the title card, who-are-you, the tutorial, the
// rail, the Build menu (its tabs and cards), the Bank (a small loan quote, borrow, repay, save), the Range card, the tips, a hole's card and its
// Play this hole, Settings. Each click must change something (the page's text or controls, or the game's state through window.__game) and raise no
// console error. Prints a table of every button (PASS, SAME with the reason it may, LOCKED with its reason, or FAIL) and exits 1 on any FAIL.
// J9: after who-are-you the start is chosen (the card, Turn, a refused spot's reason, then "Pick a spot for me", or with --pick spot a click on a spot that fits).
//   npm run jam:smoke                 (node scripts/jam/smoke.mjs [--headed] [--keep] [--port N] [--pick auto|spot])
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve('.'), OUT = 'dist-jam';
if (!existsSync(resolve(ROOT, OUT, 'index.html'))) { console.error(`no ${OUT}/index.html: run npm run build:jam first`); process.exit(2); }
const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = Number(opt('port', 0)) || await freePort();
const server = await preview({ root: ROOT, logLevel: 'error', build: { outDir: OUT }, preview: { port, strictPort: true, host: '127.0.0.1' } });
const base = `http://127.0.0.1:${port}/`;

const rows = [], errors = [];
let lastErrors = 0;
const row = (area, label, result, note = '') => { rows.push({ area, label, result, note }); console.log(`${result.padEnd(6)} ${area.padEnd(12)} ${label}${note ? `  (${note})` : ''}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, acceptDownloads: false });
await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase?.('ce'); } catch { /* none */ } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`); });
page.on('dialog', d => d.dismiss().catch(() => {}));

/** what a click may change: the page's text and controls, and the game's state */
const fingerprint = () => page.evaluate(() => {
  const g = window.__game, t = document.body.innerText; let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  const on = [...document.querySelectorAll('[aria-pressed="true"],[aria-expanded="true"],[aria-selected="true"],.chip-on,.card-on')].map(e => e.getAttribute('data-testid') || e.textContent?.trim().slice(0, 20)).join('|');
  const s = g ? { tool: g.tool, ui: g.uiTool, panel: g.panel, speed: g.speed, cam: [Math.round(g.cam.X), Math.round(g.cam.Y), Math.round(g.cam.z * 1000)], card: g.range?.cardOpen, money: Math.round(g.money), placing: !!g.placing, club: !!g.clubPlacing, hole: g.holeCardHole, v3: g.view3pHole, rings: !!g.guideRings, anchor: g.guideAnchor?.id ?? null, walk: g.youWalkMode, plan: g.paint?.mode } : null;
  return JSON.stringify({ h, n: document.querySelectorAll('*').length, on, s });
});
const settle = (ms = 350) => page.waitForTimeout(ms);
const newErrors = () => { const e = errors.slice(lastErrors); lastErrors = errors.length; return e; };

/** clicks the element and judges it: changed and no new console error is a PASS; same is SAME when `same` says why it may be, else FAIL */
async function click(area, label, loc, o = {}) {
  try {
    await loc.waitFor({ state: 'visible', timeout: 4000 });
    if (await loc.getAttribute('aria-disabled') === 'true') { row(area, label, 'LOCKED', (await loc.getAttribute('title')) ?? ''); return false; }
    if (await loc.isDisabled()) { row(area, label, 'LOCKED', (await loc.getAttribute('title')) ?? 'disabled'); return false; }
    newErrors();
    const before = await fingerprint();
    await loc.click({ timeout: 4000 });
    await settle(o.wait ?? 400);
    const after = await fingerprint(), errs = newErrors();
    if (errs.length) { row(area, label, 'FAIL', errs.join(' / ')); return false; }
    if (after === before) { row(area, label, o.same ? 'SAME' : 'FAIL', o.same ?? 'the click changed nothing'); if (has('debug')) console.log('   state', before.slice(0, 400)); return !!o.same; }
    row(area, label, 'PASS'); return true;
  } catch (e) { row(area, label, 'FAIL', String(e.message ?? e).split('\n')[0]); return false; }
}
/** the visible, named buttons under a root (their test ids or labels), to click each in turn */
const buttonsIn = root => page.evaluate(sel => {
  const r = document.querySelector(sel); if (!r) return [];
  return [...r.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => ({ id: b.getAttribute('data-testid'), label: (b.getAttribute('aria-label') || b.innerText || b.title || '').trim().replace(/\s+/g, ' ').slice(0, 60) })).filter(b => b.id || b.label);
}, root);
const byButton = (root, b) => b.id ? page.locator(`${root} [data-testid="${b.id}"]`).first() : page.locator(`${root} button`).filter({ hasText: b.label }).first();
const esc = async () => { await page.keyboard.press('Escape'); await settle(200); };
const game = fn => page.evaluate(fn);
/** J10 (#1269): every Show me puts the spotlight up (the rest dimmed and blurred, its target cut out) and finds its target: checked here, then put away with Esc (the layer
 *  covers the page, so the next click would land on it; Esc ends it and nothing else) */
async function spotlightOn(area, label) {
  const found = await page.waitForFunction(() => document.querySelector('[data-testid="spotlight"]')?.dataset.on === '1', null, { timeout: 4000 }).then(() => true, () => false);
  const note = found ? await page.evaluate(() => { const L = document.querySelector('[data-testid="spotlight"]'), C = document.querySelector('[data-testid="spotlight-caption"]'); return `blur ${L?.dataset.blur}, caption "${C?.querySelector('.spot-cap-title')?.textContent ?? ''}"`; }) : 'Show me did not light its target';
  row(area, `${label}: spotlight`, found ? 'PASS' : 'FAIL', note);
  await esc();
  if (found && await page.locator('[data-testid="spotlight"]').count()) row(area, `${label}: Esc ends the spotlight`, 'FAIL', 'it is still up');
}
/** a click that opened the view from behind the golfer (Play this hole, Hit balls): Back to the course, itself a button under test */
async function closeView(area) {
  if (!(await game(() => window.__game.view3pHole !== null))) return;
  await settle(1500);
  await click(area, 'Back to the course', page.locator('[aria-label="Back to the course"]').first(), { wait: 1200 });
  if (await game(() => window.__game.view3pHole !== null)) await game(() => window.__game.close3p());
}
/** clicks every visible button under root once, scanning again after each click (a click may add or remove buttons), reopening the card when a click
 *  closed it, closing any view a click opened and putting down any placement it took in hand. skip: buttons not to press; same: why a button may change nothing */
async function sweep(area, root, reopen, o = {}) {
  const done = new Set();
  for (let k = 0; k < 80; k++) {
    if (!(await page.locator(root).first().isVisible().catch(() => false))) { await reopen(); await settle(); }
    const next = (await buttonsIn(root)).find(b => !done.has(b.id ?? b.label) && !(o.skip?.(b)));
    if (!next) break;
    done.add(next.id ?? next.label);
    await click(area, next.id ?? next.label, byButton(root, next), { wait: 600, same: o.same?.(next) });
    await closeView(area);
    if (await game(() => !!window.__game.placing || !!window.__game.clubPlacing || window.__game.paint?.mode === 'plan')) await putDownAll();
  }
}
const putDownAll = async () => { await esc(); await game(() => { const g = window.__game; if (g.placing) g.placing = null; g.placeClubhouse?.(false); g.armPractice?.(null); g.paint?.cancelPlan?.(); g.setTool('select'); g.emit(); }); await settle(200); };

try {
  console.log(`jam smoke: ${base} (Chrome ${browser.version()})`);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // ---- the title card
  await page.locator('[data-testid="title-card"]').waitFor({ timeout: 120000 });
  await click('title', 'How to play', page.locator('[data-testid="title-how"]'));
  await click('title', 'Hide how to play', page.locator('[data-testid="title-how"]'));
  await click('title', 'New game', page.locator('[data-testid="title-new"]'), { wait: 1500 });
  // ---- who are you
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  const who = page.locator('button', { hasText: "That's me" });
  await who.waitFor({ timeout: 60000 });
  await page.locator('input[placeholder="Your name"]').fill('Smoke Test').catch(() => {});
  const looks = page.locator('[aria-label^="Look"], [data-testid^="look-"]');
  if (await looks.count() > 1) await click('who', 'a second look', looks.nth(1), { same: 'it may already be picked' });
  for (const w of ['Desert', 'Autumn']) { const b = page.locator('button', { hasText: w }).first(); if (await b.isVisible().catch(() => false)) await click('who', w, b, { same: 'already the world' }); }
  await click('who', "That's me", who, { wait: 1500 });
  // ---- J9: the start is chosen, not laid: the card over the bare map, Turn, a refused spot says why, then the start is laid (Pick a spot for me, or a click on a spot that fits)
  const pickCard = page.locator('[data-testid="start-pick-card"]');
  try { await pickCard.waitFor({ timeout: 60000 }); row('start', 'the choose-your-start card shows', 'PASS'); } catch { row('start', 'the choose-your-start card shows', 'FAIL', 'no start-pick card after Who are you'); }
  if (await pickCard.isVisible().catch(() => false)) {
    const text = (await page.locator('[data-testid="start-pick-text"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    row('start', 'the card says what a click does', /buys the land and the old range for \$[\d,. ]+ and builds your house/.test(text) ? 'PASS' : 'FAIL', text.slice(0, 120));
    await click('start', 'Turn (R)', page.locator('[data-testid="start-pick-turn"]'));
    await page.keyboard.press('r'); await settle(250);
    // the ghost is the game's placement ghost: spots that fit (green) and one that does not (red, with its reason), found as a player looks over the map (the ghost's own test at
    // each pointer position: a spot whose geometry fits is only settled once the pointer rests on it, when its county road is worked out: so each candidate is hovered a moment)
    const found = await game(() => {
      const g = window.__game, p = g.placing, out = { fit: [], refused: null, n: 0 }; if (!p) return { ...out, none: true };
      const W = g.cssW, H = g.cssH, cx = W / 2, cy = H / 2;
      for (let y = 60; y < H - 160; y += 24) for (let x = 40; x < W - 40; x += 24) {
        const t = g.tileAt(x, y), s = p.spot(t.x, t.y); out.n++;
        if (!s.why) out.fit.push({ x, y }); else if (!out.refused) out.refused = { x, y, why: s.why };
      }
      out.fit.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)); out.fit = out.fit.slice(0, 12);
      return out;
    });
    const hoverAt = async c => { await page.mouse.move(c.x - 10, c.y - 10); await page.mouse.move(c.x, c.y, { steps: 3 }); await settle(450); };
    const verdict = () => game(() => { const g = window.__game, p = g.placing, h = g.hover; if (!p || !h) return null; const s = p.spot(h.x, h.y); return { why: p.why(s), pending: !!s.pending }; });
    if (found.none) row('start', 'the start is in hand (the placement ghost)', 'FAIL', 'no placement in hand');
    else {
      if (found.refused) { await hoverAt(found.refused); const v = await verdict(); row('start', 'a spot that does not fit says why', v?.why ? 'PASS' : 'FAIL', v?.why ?? found.refused.why); }
      else row('start', 'a spot that does not fit says why', 'SAME', 'every spot on this view fits');
      let fit = null; for (const c of found.fit) { await hoverAt(c); const v = await verdict(); if (v && !v.why && !v.pending) { fit = c; break; } }
      row('start', 'a spot that fits is green once the pointer rests on it', fit ? 'PASS' : 'FAIL', fit ? '' : 'no spot on the view fits');
      if (opt('pick', 'auto') === 'spot') {
        if (!fit) row('start', 'a click on a spot that fits', 'FAIL', 'no spot on the view fits');
        else { await hoverAt(fit); newErrors(); await page.mouse.down(); await page.mouse.up(); await settle(2500); const errs = newErrors(); row('start', 'a click on a spot that fits lays the start', errs.length ? 'FAIL' : 'PASS', errs.join(' / ')); }
      } else await click('start', 'Pick a spot for me', page.locator('[data-testid="start-pick-auto"]'), { wait: 2500 });
    }
    const laid = await game(() => { const g = window.__game, b = g.golf?.range; return { picking: !!g.startPick, money: Math.round(g.money), built: b?.built !== false, forSale: !!b?.forSale, scene: !!g.range?.scene, owned: b?.owned?.length ?? 0, speed: g.speed }; });
    const ok = !laid.picking && laid.built && !laid.forSale && laid.scene && laid.money === 60000 && laid.owned >= 3;
    row('start', 'the start is laid: the range bought with the land ($75,000 less $15,000), no Buy step', ok ? 'PASS' : 'FAIL', JSON.stringify(laid));
  }
  await game(() => window.__game.setSpeed(0));
  // ---- the tutorial: every Show me, then Next to the end
  const tour = '[data-testid="tour"]';
  await page.locator(tour).waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}); // (J9: the card follows the start's click once the new view's ground is baked, a few seconds)
  if (await page.locator(tour).isVisible().catch(() => false)) {
    for (let k = 0; k < 6 && await page.locator(tour).isVisible().catch(() => false); k++) {
      const title = `step ${k + 1}`;
      const show = page.locator(`${tour} button`, { hasText: 'Show me' }).first();
      // (a step shows itself as it becomes current: put that away first, as a player who closed it would, so Show me has to show it again)
      await settle(1200); // (the new step shows itself a frame or two after Next: let it, then put it away)
      await game(() => { const g = window.__game; if (g.panel === 'bank') g.toggleMoneyPanel(); g.guideAnchor = null; g.openRangeCard(false); g.emit(); }); await settle(300);
      if (await show.isVisible().catch(() => false)) { await click('tutorial', `Show me: ${title}`, show, { wait: 800 }); await spotlightOn('tutorial', `Show me: ${title}`); }
      if (await game(() => window.__game.panel === 'bank')) await game(() => { window.__game.toggleMoneyPanel(); });
      await game(() => window.__game.openRangeCard(false));
      const next = page.locator(`${tour} button`, { hasText: /^Next$/ }).first();
      if (!(await next.isVisible().catch(() => false))) break;
      await click('tutorial', `Next: ${title}`, next);
    }
  } else row('tutorial', '(no tutorial card)', 'FAIL', 'the jam tutorial did not show');
  if (opt('stop-after', '') === 'tutorial') throw new Error('stop-after tutorial');
  // ---- the rail
  for (const id of await page.evaluate(() => [...document.querySelectorAll('[data-rail]')].filter(b => b.offsetParent !== null).map(b => b.getAttribute('data-rail')))) {
    await click('rail', id, page.locator(`[data-rail="${id}"]`).first(), { same: id === 'walk' || id === 'select' ? 'the cursor already in hand' : undefined });
    if (id !== 'walk' && id !== 'select') { await esc(); await game(() => { const g = window.__game; g.openRangeCard?.(false); g.setTool('select'); }); await page.locator('[data-testid="build-close"]').click({ timeout: 500 }).catch(() => {}); }
  }
  // ---- the Build menu: its tabs and every card (each act then put down), Tips
  const openBuild = async () => { if (!(await page.locator('[data-testid="build-menu"]').isVisible().catch(() => false))) await page.locator('[data-rail="build"]').click(); await page.locator('[data-testid="build-menu"]').waitFor({ timeout: 4000 }); };
  const putDown = async () => { await esc(); await esc(); await game(() => { const g = window.__game; if (g.placing) g.placing = null; g.placeClubhouse?.(false); g.armPractice?.(null); g.openRangeCard?.(false); g.closeHoleCard?.(); g.paint?.cancelPlan?.(); g.setTool('select'); if (g.panel) g.panel = null; g.emit(); }); await settle(200); };
  await openBuild();
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="build-tab-"]')].map(b => b.getAttribute('data-testid')));
  for (const t of tabs) {
    await openBuild();
    await click('build', `tab ${t.replace('build-tab-', '')}`, page.locator(`[data-testid="${t}"]`), { same: 'the tab already open' });
    const cards = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="build-card-"]')].filter(b => b.offsetParent !== null).map(b => b.getAttribute('data-testid')));
    for (const c of cards) {
      await openBuild(); await page.locator(`[data-testid="${t}"]`).click();
      if (c === 'build-card-range') continue; // (opened once below, as a player would)
      await click('build', `card ${c.replace('build-card-', '')}`, page.locator(`[data-testid="${c}"]`), { wait: 600 });
      await closeView('build'); await putDown();
    }
  }
  await openBuild();
  await click('build', 'Tips', page.locator('[data-testid="build-tips"]'));
  // ---- the tips: each opens, and every Show me
  const tipsRoot = '[data-testid="tips"]';
  if (await page.locator(tipsRoot).isVisible().catch(() => false)) {
    for (const id of await page.evaluate(() => [...document.querySelectorAll('[data-testid^="tips-tip-"]')].map(e => e.getAttribute('data-testid')))) {
      const head = page.locator(`[data-testid="${id}"] button[aria-expanded]`).first();
      if (await head.getAttribute('aria-expanded') !== 'true') await click('tips', id.replace('tips-', ''), head);
      const show = page.locator(`[data-testid="tips-show-${id.replace('tips-', '')}"]`);
      if (await show.isVisible().catch(() => false)) { await click('tips', `Show me: ${id.replace('tips-', '')}`, show, { wait: 800 }); await spotlightOn('tips', `Show me: ${id.replace('tips-', '')}`); await putDown(); await page.locator('[data-testid="build-close"]').click({ timeout: 500 }).catch(() => {}); if (!(await page.locator(tipsRoot).isVisible().catch(() => false))) { await openBuild(); await page.locator('[data-testid="build-tips"]').click(); await settle(); } }
    }
    await click('tips', 'Close the tips', page.locator('[data-testid="tips-close"]'));
  } else row('tips', '(no tips card)', 'FAIL', 'Build › Tips did not open the tips');
  // ---- the range's card from Build (J9: the range was bought with the land; a game from before may still show Buy), then the Range card
  await openBuild(); await page.locator('[data-testid="build-tab-range"]').click();
  const buy = page.locator('[data-testid="build-card-range"]');
  await click('build', 'card range (open the range card)', buy, { wait: 1200 });
  await putDown();
  const rangeChip = page.locator('[data-testid="range-chip"]');
  if (await rangeChip.isVisible().catch(() => false)) {
    await click('top bar', 'Range chip', rangeChip);
    await sweep('range card', '[data-testid="range-card"]', () => game(() => window.__game.openRangeCard(true)), {
      skip: b => /^(Close|✕)/.test(b.label) || b.id === 'range-close',
      same: b => /^[−+]$/.test(b.label) ? 'a price step at its limit' : undefined,
    });
    await game(() => window.__game.openRangeCard(false));
  } else row('top bar', 'Range chip', 'FAIL', 'no range chip after buying the range');
  // ---- the Bank: open from the cash, a small loan quote, borrow, repay, save, take
  await click('top bar', 'cash (the Bank)', page.locator('[data-testid="stat-chips"] button').first());
  const bank = '[data-testid="bank-panel"]';
  if (await page.locator(bank).isVisible().catch(() => false)) {
    for (const t of ['bank-term-12', 'bank-term-36', 'bank-term-24']) await click('bank', t, page.locator(`[data-testid="${t}"]`), { same: 'the term already picked' });
    await page.locator(`${bank} [data-testid="bank-slider"]`).fill('10000').catch(() => {});
    await click('bank', 'borrow (a small loan)', page.locator('[data-testid="bank-sign"]'), { wait: 600 });
    for (const b of await buttonsIn(bank)) {
      if (/^bank-(sign|term-|close)/.test(b.id ?? '') || /Close/.test(b.label)) continue;
      await click('bank', b.id ?? b.label, byButton(bank, b), { wait: 500, same: /Take|Save all/.test(b.label) ? 'nothing saved to take, or all saved' : undefined });
      if (!(await page.locator(bank).isVisible().catch(() => false))) await game(() => { if (window.__game.panel !== 'bank') window.__game.toggleMoneyPanel(); });
    }
    await click('bank', 'close', page.locator(`${bank} [data-testid="bank-close"], ${bank} [aria-label^="Close"]`).first());
  } else row('bank', '(no Bank panel)', 'FAIL', 'the cash did not open the Bank');
  // ---- a hole (built through the New hole wizard, as the menu's card starts it), its card, Play this hole
  const built = await game(() => {
    const g = window.__game; g.paint.host.planLock = () => null; // (the hole gate needs months of range takings: the smoke test opens it)
    const P = g.golf.parcel, p = g.paint, w = p.wizard; g.setTool('course'); if (g.tool !== 'course') return 'no course tool';
    for (let y = P[1] + 20; y < P[1] + P[3] - 20; y += 30) for (let x = P[0] + 20; x < P[0] + P[2] - 20; x += 30) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const gx = x + dx * 60, gy = y + dy * 60; if (gx < P[0] + 10 || gy < P[1] + 10 || gx > P[0] + P[2] - 10 || gy > P[1] + P[3] - 10) continue;
      if (!p.setPlan()) return 'no plan'; p.pointerDown({ x, y }, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'green') { p.cancelPlan(); continue; }
      p.pointerDown({ x: gx, y: gy }, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'shape') { p.cancelPlan(); continue; }
      if (!w.check().ok) { p.cancelPlan(); continue; } p.buildPlan(); g.setTool('select'); return 'ok';
    }
    return 'no spot';
  });
  if (built === 'ok') {
    await game(() => { const g = window.__game; g.holeCardHole = 1; g.emit(); }); await settle();
    const hc = '[data-testid="hole-card"]';
    await sweep('hole card', hc, () => game(() => { const g = window.__game; g.holeCardHole = 1; g.emit(); }), {
      skip: b => /Close/.test(b.label) || b.id === 'hole-play-3p' || /^hole-delete/.test(b.id ?? '') || /^No\. /.test(b.label),
      same: b => /Golden|Day|Framed/.test(b.label) ? 'the light or frame already as asked' : undefined,
    });
    if (!(await page.locator(hc).isVisible().catch(() => false))) { await game(() => { const g = window.__game; g.holeCardHole = 1; g.emit(); }); await settle(); }
    await click('hole card', 'Delete (asks first)', page.locator('[data-testid="hole-delete"]'));
    await click('hole card', 'Keep it (no delete)', page.locator('[data-testid="hole-delete-confirm"] button').filter({ hasText: /^Keep it$/ }).first());
    if (!(await page.locator(hc).isVisible().catch(() => false))) { await game(() => { const g = window.__game; g.holeCardHole = 1; g.emit(); }); await settle(); }
    if (await click('hole card', 'Play this hole', page.locator('[data-testid="hole-play-3p"]'), { wait: 2000 })) {
      await page.waitForFunction(() => { const f = document.querySelector('iframe'); try { return !!f?.contentDocument?.querySelector('canvas'); } catch { return false; } }, null, { timeout: 120000 }).catch(() => {});
      await closeView('golf view');
    }
  } else row('hole card', '(no hole)', 'FAIL', `the wizard built no hole: ${built}`);
  // ---- Settings
  await click('top bar', 'Settings', page.locator('[data-tip="Settings"]').first());
  for (const b of await buttonsIn('div.relative:has(> button[data-tip="Settings"])')) {
    if (/New game|Load|Download|Save$|^Settings$/.test(b.label)) continue; // (they replace or download the game; the gear itself)
    await click('settings', b.id ?? b.label, page.locator('button').filter({ hasText: b.label }).first(), { same: /100%|USD/.test(b.label) ? 'already the setting' : undefined });
  }
  await esc();
  // ---- the speeds
  for (const s of ['1', '4', '20']) await click('top bar', `speed ${s}x`, page.locator(`[data-testid="speed-${s}"]`));
  await click('top bar', 'pause', page.locator('[data-tip="Pause (Space)"]').first());
} finally {
  if (!has('keep')) { await browser.close().catch(() => {}); await server.close?.().catch?.(() => {}); server.httpServer?.close?.(); }
}

const fail = rows.filter(r => r.result === 'FAIL');
console.log(`\n${'result'.padEnd(7)}${'area'.padEnd(13)}button`);
for (const r of rows) console.log(`${r.result.padEnd(7)}${r.area.padEnd(13)}${r.label}${r.note ? `  (${r.note})` : ''}`);
console.log(`\n${rows.length} buttons: ${rows.filter(r => r.result === 'PASS').length} pass, ${rows.filter(r => r.result === 'SAME').length} same (allowed), ${rows.filter(r => r.result === 'LOCKED').length} locked, ${fail.length} fail; ${errors.length} console errors`);
if (errors.length) for (const e of errors) console.log(`  ${e}`);
process.exit(fail.length || errors.length ? 1 : 0);

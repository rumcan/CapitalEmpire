// T366 (#1021; the owner, 2026-11-08): the menu fixes, in the real game (a headless Edge on the dev server, a golf game: ?start=town&seed=7), before and after:
//   rail     the left rail's labels at 90, 100, 110 and 125% UI scale: each label's lines (its height over its line height) and whether it spills out of its button; the footer's
//            too; shots of the rail at 100% and 125%
//   rows     the buttons that open a side menu: the Bunker look row in the Course panel (the panel's shot), the Edit and look rows of a surface in hand, the Bag's putter slots
//   heads    the windows' headers while their content is scrolled (a short screen, 1366 x 620, so they scroll): Event Structures, the Season card, the Bag's club detail, the
//            clubhouse card: where the close button stands against the window's top after the scroll (pinned: about 0; before: scrolled out, negative), and a shot of each
//   skip     the Skip to tournament button: in the top bar before, in the Season card after (its box and the shot of each)
//   node scripts/dev/menu-fixes-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T366 --tag after [--only rail,rows,heads,skip]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game. Saves are not written.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/menu-fixes-shots'), tag = opt('tag', 'after'), seed = opt('seed', '7');
const only = new Set(opt('only', 'rail,rows,heads,skip').split(','));
const W = 1366, H = 768, HS = 620;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { tag, rail: {}, rows: {}, heads: {}, skip: {} };
const save = async (buf, name) => { const file = join(out, `${tag}-${name}.jpg`); await sharp(buf).jpeg({ quality: 88, mozjpeg: true }).toFile(file); console.log(file); return file; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
/** a clip of an element's box (grown by pad), within the viewport */
const clipOf = async (page, loc, pad = 8) => {
  const b = await loc.boundingBox(); if (!b) return null; const vp = page.viewportSize();
  const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
  return { x, y, width: Math.min(vp.width - x, b.width + 2 * pad), height: Math.min(vp.height - y, b.height + 2 * pad) };
};
const shotOf = async (page, loc, name, pad = 8) => { const clip = await clipOf(page, loc, pad); if (!clip) { console.log(`  (no box for ${name})`); return null; } return save(await page.screenshot({ type: 'png', clip }), name); };
async function open(size) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.emit(); });
  await page.waitForFunction(() => window.__game?.courseGrid, null, { timeout: 120000 });
  // the start tutorial and the Mayor's Cup card stand where every right-hand window docks: out of the way for the shots
  await page.evaluate(() => { const g = window.__game; g.tourSkipStep?.(null); g.openEventCard?.(null); g.emit(); });
  await settle(page, 1500);
  return { ctx, page };
}
const flow = async (name, fn) => { try { await fn(); } catch (e) { const why = String(e.message).split('\n')[0]; console.log('[flow failed]', name, why); report[name].failed = why; } };

try {
  // ---------------- rail
  if (only.has('rail')) await flow('rail', async () => {
    const { ctx, page } = await open({ width: W, height: H });
    for (const s of [0.9, 1, 1.1, 1.25]) {
      await page.evaluate(s => document.documentElement.style.setProperty('--ui-scale', String(s)), s); await sleep(700);
      const m = await page.evaluate(() => {
        const one = btn => {
          const sp = [...btn.querySelectorAll('span')].find(x => x.textContent && x.textContent.trim().length > 2 && !x.classList.contains('new-badge') && !x.classList.contains('rail-lock')); if (!sp) return null;
          const cs = getComputedStyle(sp), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2, r = sp.getBoundingClientRect(), b = btn.getBoundingClientRect();
          return { label: sp.textContent.trim(), lines: Math.max(1, Math.round(r.height / lh)), spill: Math.round(Math.max(0, r.width - b.width + 0.5)), textW: Math.round(r.width), btnW: Math.round(b.width) };
        };
        const side = [...document.querySelectorAll('[data-testid="rail"] .rail-tab')].map(one).filter(Boolean);
        const foot = [...document.querySelectorAll('[data-testid="rail-footer"] .rail-tab')].map(one).filter(Boolean);
        return { side, foot };
      });
      report.rail[`${Math.round(s * 100)}%`] = m;
      const bad = [...m.side, ...m.foot].filter(x => x.lines > 1 || x.spill > 0);
      console.log(`rail at ${Math.round(s * 100)}%: ${m.side.length} labels, ${m.foot.length} footer; two lines or spilling: ${bad.map(x => `"${x.label}" (${x.lines} lines, spill ${x.spill})`).join(', ') || 'none'}`);
      if (s === 1 || s === 1.25) await shotOf(page, page.locator('[data-testid="rail"]').first(), `rail-${Math.round(s * 100)}`, 6);
    }
    await ctx.close();
  });

  // ---------------- rows: the Bunker look row in the Course panel, a surface in hand's rows, the Bag's putter slots
  if (only.has('rows')) await flow('rows', async () => {
    const { ctx, page } = await open({ width: W, height: H });
    const hole = await page.evaluate(() => { const g = window.__game, grid = g.courseGrid; for (let k = 0; k < grid.hole.length; k++) if (grid.hole[k]) return grid.hole[k]; return 1; });
    await page.evaluate(h => { const g = window.__game; g.setTool('course'); const p = g.paint; p.setHole(h); p.setBrush('bunker'); g.emit(); }, hole); await sleep(900);
    const panel = page.locator('[data-testid="tool-panel"]').first();
    report.rows.bunkerRow = await page.evaluate(() => { const b = document.querySelector('[data-bunker-look]'); if (!b) return null; const r = b.getBoundingClientRect(), p = b.closest('[data-testid="tool-panel"]')?.getBoundingClientRect(); return { cls: b.className, w: Math.round(r.width), panelW: p ? Math.round(p.width) : null, text: b.textContent.trim().slice(0, 60) }; });
    console.log('Bunker look button:', JSON.stringify(report.rows.bunkerRow));
    await page.locator('[data-bunker-look]').first().scrollIntoViewIfNeeded().catch(() => {});
    await shotOf(page, panel, 'panel-bunker', 4);
    // a surface in hand: the fairway's look entry ("My looks"), then the focus view's Edit row
    await page.evaluate(() => { const g = window.__game, p = g.paint; p.setBrush('fairway'); g.emit(); }); await sleep(600);
    const looks = page.locator('[data-testid="looks-entry"]').first();
    if (await looks.count()) { await looks.scrollIntoViewIfNeeded().catch(() => {}); report.rows.looksEntry = await looks.evaluate(el => { const b = el.querySelector('button'); const r = b?.getBoundingClientRect(); return b ? { cls: b.className, w: Math.round(r.width), text: b.textContent.trim().slice(0, 60) } : null; }); console.log('looks entry:', JSON.stringify(report.rows.looksEntry)); await shotOf(page, panel, 'panel-fairway', 4); }
    await page.evaluate(() => { const g = window.__game, p = g.paint; p.setBrush('bunker'); g.emit(); }); await sleep(400);
    const sw = page.locator('[data-swatch="fairway"]').first(); if (await sw.count()) { await sw.scrollIntoViewIfNeeded().catch(() => {}); await sw.click(); await sleep(900); }
    const edit = page.locator('[data-focus-edit]').first();
    if (await edit.count()) { await edit.scrollIntoViewIfNeeded().catch(() => {}); report.rows.focusEdit = await edit.evaluate(b => { const r = b.getBoundingClientRect(), p = b.closest('[data-testid="tool-panel"]')?.getBoundingClientRect(); return { cls: b.className, w: Math.round(r.width), panelW: p ? Math.round(p.width) : null, text: b.textContent.trim().slice(0, 60) }; }); console.log('Edit the fairway look:', JSON.stringify(report.rows.focusEdit)); await shotOf(page, panel, 'panel-focus', 4); }
    else console.log('  (no fairway focus view)');
    // the Bag's putter: Shaft and Head
    await page.evaluate(() => { const g = window.__game; g.setTool('select'); g.emit(); }); await sleep(300);
    const bagChip = page.locator('[data-testid="bag-chip"]').first();
    if (await bagChip.count()) {
      await bagChip.click(); await sleep(600); await page.locator('[data-testid="bag-club-putter"]').first().click(); await sleep(600);
      report.rows.bagSlots = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="bag-slot-"]')].map(b => { const r = b.getBoundingClientRect(); return { id: b.getAttribute('data-testid'), cls: b.className, w: Math.round(r.width), text: b.textContent.trim().slice(0, 40) }; }));
      console.log('Bag slots:', JSON.stringify(report.rows.bagSlots));
      await page.locator('[data-testid="bag-slot-shaft"]').first().click().catch(() => {}); await sleep(500);
      await shotOf(page, page.locator('[data-testid="bag-root"]').first(), 'bag-putter', 6);
    } else console.log('  (no bag chip)');
    await ctx.close();
  });

  // ---------------- heads: a short screen, the windows scrolled
  if (only.has('heads')) await flow('heads', async () => {
    const { ctx, page } = await open({ width: W, height: HS });
    const measure = async (name, sel) => {
      const el = page.locator(sel).first(); if (!(await el.count())) { console.log(`  (no ${name})`); report.heads[name] = { missing: true }; return; }
      const m = await el.evaluate(win => {
        const room = win.scrollHeight - win.clientHeight; win.scrollTop = Math.min(room, 600);
        const btn = [...win.querySelectorAll('button')].find(b => /close|✕|×/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.title ?? ''} ${b.textContent ?? ''}`));
        const head = btn?.closest('.win-head') ?? null, wr = win.getBoundingClientRect(), br = btn?.getBoundingClientRect();
        return { scrollable: room > 1, room: Math.round(room), scrolled: Math.round(win.scrollTop), closeTop: br ? Math.round(br.top - wr.top) : null, closeVisible: br ? br.top >= wr.top - 1 && br.bottom <= wr.bottom + 1 : false, winHead: !!head, headTop: head ? Math.round(head.getBoundingClientRect().top - wr.top) : null };
      });
      report.heads[name] = m; console.log(name, JSON.stringify(m)); await sleep(300);
      await shotOf(page, el, `head-${name}`, 6);
    };
    // Event Structures
    await page.evaluate(() => { window.__game.toggleEventTool?.(); }); await sleep(800);
    await measure('event-structures', '[class*="max-h-[75vh]"]');
    await page.evaluate(() => { const g = window.__game; if (g.eventTool) g.toggleEventTool(); g.emit(); }); await sleep(300);
    // the Season card
    const season = page.locator('[data-guide="season-chip"]').first();
    if (await season.count()) { await season.click(); await sleep(900); await measure('season-card', '[data-testid="season-card"]'); await season.click().catch(() => {}); await sleep(300); }
    // the Bag's club detail
    const bag = page.locator('[data-testid="bag-chip"]').first();
    if (await bag.count()) { await bag.click(); await sleep(500); await page.locator('[data-testid="bag-club-putter"]').first().click(); await sleep(600); await measure('bag-detail', '[data-testid="bag-detail"]'); await measure('bag-card', '[data-testid="bag-card"]'); await bag.click().catch(() => {}); await sleep(300); }
    // the clubhouse card
    const club = page.locator('[data-testid="club-chip"]').first();
    if (await club.count()) { await club.click(); await sleep(700); await measure('club-card', '[data-testid="club-card"]'); }
    await ctx.close();
  });

  // ---------------- skip: where the button is
  if (only.has('skip')) await flow('skip', async () => {
    const { ctx, page } = await open({ width: W, height: H });
    const box = sel => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), disabled: !!e.disabled, text: e.textContent.trim().slice(0, 40) } : null; }, sel);
    report.skip.topBar = await box('[data-guide="chip-skip"]'); console.log('the top bar has it:', JSON.stringify(report.skip.topBar));
    report.skip.rushInSpeedBar = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /next rush hour/i.test(b.getAttribute('data-tip') ?? '')));
    await save(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: 130 } }), 'skip-topbar');
    const season = page.locator('[data-guide="season-chip"]').first();
    await season.click(); await sleep(900);
    report.skip.inSeasonCard = await box('[data-testid="season-card"] [data-guide="chip-skip"]'); console.log('the Season card has it:', JSON.stringify(report.skip.inSeasonCard));
    await shotOf(page, page.locator('[data-testid="season-card"]').first(), 'skip-season-card', 6);
    await ctx.close();
  });
} finally { await browser.close(); }
writeFileSync(join(out, `${tag}-summary.json`), JSON.stringify(report, null, 1));
console.log('== summary written');

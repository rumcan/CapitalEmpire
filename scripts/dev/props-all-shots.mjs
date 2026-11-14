// T369 (#1024; the owner, 2026-11-08: "I also can't see all props when I click the checkbox"): the Props panel's "All props" box.
// On a range start (seed 1), 1600 x 900:
//   A  Facilities > Decoration > Props > Plants (the panel shows Plants alone), then the box ticked: every prop (before T369: still Plants alone)
//   B  Props > All props (the course's props), the box unticked and ticked
//   C  Town decoration > Props, the box unticked and ticked
// Each state's cards are counted (data-card="prop-...") against what the panel says it can show ("Showing n of m props", T369) and the catalogue's
// placeable count (window.__game.decor.ctx is not needed: the line carries both), and the panel is looked at at 100% and 125% UI scale: no sideways
// scroll (its scrollWidth within its clientWidth). Shots: the panel's top and its end, of each state.
//   node scripts/dev/props-all-shots.mjs --base http://127.0.0.1:5189/ --out E:/ClaudeTemp/T369 --tag after
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5189/'), out = opt('out', 'output/props-all-shots'), tag = opt('tag', 'after'), seed = opt('seed', '1');
mkdirSync(out, { recursive: true });
const W = 1600, H = 900;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=range&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.prebake = () => {}; g.emit(); });
  await sleep(2500);

  /** the panel now: its cards, its groups, the line it says, whether it scrolls sideways */
  const state = () => page.evaluate(() => {
    const g = window.__game, t = g.decor, scroller = document.querySelector('[data-testid="tool-panel"]'), line = document.querySelector('[data-testid="props-count"]');
    const groups = [...document.querySelectorAll('[data-panel="props"] [data-group]')].map(e => e.getAttribute('data-group'));
    return {
      cards: document.querySelectorAll('[data-card^="prop-"]').length, groups: groups.length, all: t.all, focus: t.focus, where: t.where,
      line: line?.textContent ?? null, shown: line?.dataset.shown ?? null, placeable: line?.dataset.placeable ?? null,
      sideways: scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : null, panelH: scroller ? Math.round(scroller.scrollHeight) : 0, scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale') || '1',
    };
  });
  const scrollTo = (end) => page.evaluate(end => { const el = document.querySelector('[data-testid="tool-panel"]'); if (el) el.scrollTop = end ? el.scrollHeight : 0; }, end);
  /** the panel's top and end, as two shots */
  const shotPanel = async (name) => {
    const files = [];
    for (const end of [false, true]) {
      await scrollTo(end); await sleep(500);
      const box = await page.locator('[data-testid="tool-panel"]').boundingBox();
      if (!box) { console.log(`  (no panel for ${name})`); return files; }
      const clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(W - Math.max(0, box.x - 8), box.width + 16), height: Math.min(H - Math.max(0, box.y - 8), box.height + 16) };
      const file = join(out, `${tag}-${name}-${end ? 'end' : 'top'}.jpg`);
      await sharp(await page.screenshot({ type: 'png', clip })).jpeg({ quality: 88, mozjpeg: true }).toFile(file); files.push(file); console.log(file);
    }
    await scrollTo(false);
    return files;
  };
  const record = async (name, shots = true) => {
    await sleep(900);
    const s = await state(); s.name = name;
    // 125% UI scale too: the same panel, looked at for a sideways scroll
    const at125 = await page.evaluate(() => { document.documentElement.style.setProperty('--ui-scale', '1.25'); return true; }).then(async () => { await sleep(500); const q = await state(); await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1')); await sleep(300); return q; });
    s.sidewaysAt125 = at125.sideways; s.cardsAt125 = at125.cards;
    if (shots) s.files = await shotPanel(name);
    results.push(s); console.log(JSON.stringify(s));
  };
  const row = async (level, sel) => { const el = page.locator(`[data-flyout-col="${level}"] ${sel}`).first(); await el.hover(); await sleep(450); return el; };
  const tick = async (on) => { const box = page.locator('[data-testid="props-all"] input'); if (on) await box.check(); else await box.uncheck(); await sleep(500); };

  const flow = async (name, fn) => {
    try { await fn(); } catch (e) {
      const why = String(e.message).split('\n')[0]; console.log('[flow failed]', name, why); results.push({ name, failed: why });
      if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
    }
  };

  // A: Props > Plants, then the box
  // (#1272: Facilities is the sixth tile of the Course flyout, so every level is one column to the right)
  await flow('A', async () => {
  await page.click('[data-rail="course"]'); await sleep(600); await (await row(0, '[data-key="facilities"]')).click(); await sleep(500);
  await row(1, '[role="menuitem"]:has-text("Decoration")'); await row(2, '[role="menuitem"]:has-text("Props")');
  await (await row(3, `[data-key*='"group":"plants"']`)).click(); await sleep(900);
  await record('A1-props-plants');
  await tick(true); await record('A2-plants-then-all-ticked');
  await tick(false); await record('A3-all-unticked-again', false);
  });

  // B: Props > All props
  await flow('B', async () => {
  await page.click('[data-rail="course"]'); await sleep(600); await (await row(0, '[data-key="facilities"]')).click(); await sleep(500);
  await row(1, '[role="menuitem"]:has-text("Decoration")'); await row(2, '[role="menuitem"]:has-text("Props")');
  await (await row(3, `[data-key*='"group":null']`)).click(); await sleep(900);
  await page.evaluate(() => { window.__game.decor.setAll?.(false); if (!window.__game.decor.setAll) window.__game.decor.all = false; window.__game.emit(); }); await sleep(300);
  await record('B1-all-props-leaf', false);
  await tick(true); await record('B2-all-props-ticked');
  });

  // C: Town decoration > Props (the town's own), the box unticked then ticked
  await flow('C', async () => {
  await page.evaluate(() => { const g = window.__game; g.decor.cancel?.(); g.setTool('select'); g.emit(); }); await sleep(400);
  await page.click('[data-rail="towndecor"]'); await sleep(700);
  await row(0, '[role="menuitem"]:has-text("Props")');
  const leafAll = page.locator(`[data-flyout-col="1"] [data-key*='"group":null']`).first(); await leafAll.hover(); await sleep(300); await leafAll.click(); await sleep(900);
  await page.evaluate(() => { const t = window.__game.decor; if (t.setAll) t.setAll(false); else t.all = false; window.__game.emit(); }); await sleep(300);
  await record('C1-town-props', false);
  await tick(true); await record('C2-town-props-all-ticked');
  });
  await ctx.close();
} finally { await browser.close(); }
writeFileSync(join(out, `${tag}-summary.json`), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results.map(r => ({ name: r.name, cards: r.cards, line: r.line, sideways: r.sideways, sidewaysAt125: r.sidewaysAt125 }))));

// T255 (#739): in-game shots of a town tool's panel docked above the town footer (the owner 2026-10-29: "these windows need to move to the
// center footer where town moved to"), at 1366 and 1920 px: Traffic ▸ Roads ▸ Upgrade, Traffic ▸ Junctions, Traffic ▸ Transport ▸ Car park;
// Paint from Town decoration (the footer) and the same Paint tool from Facilities ▸ Plants (the left panel); a footer panel beside the range card
// and the guide card; and 125% UI on 1366 with the range card (the crowded screen: it may take the left panel's place). The classic town game:
// Traffic ▸ Roads ▸ Build with the hint bar standing above the panel; the crumb's back arrow opens the footer flyouts and the panel makes way.
// Each shot prints where the panel stands (its drawer, its place, its box) and whether it overlaps the minimap, the footer or a bottom card.
//   node scripts/dev/footer-panel-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T255 [--only golf,classic,ui125]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/footer-panel-shots'), only = opt('only', 'golf,classic,ui125').split(',');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (buf, name) => { const file = join(out, `${name}.jpg`); await sharp(buf).jpeg({ quality: 86, mozjpeg: true }).toFile(file); console.log(file); return file; };
/** the tool panel's box, its drawer and place, its crumb, and what it overlaps */
const report = page => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? b : null; };
  const el = document.querySelector('[data-testid="tool-panel"]'), p = r('[data-testid="tool-panel"]');
  if (!el || !p) return { panel: null };
  const hit = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  // the minimap's own parts (its map, its town chip): the box round them is wider than either
  const parts = [...(document.querySelector('[data-testid="minimap"]')?.children ?? [])].map(e => e.getBoundingClientRect());
  const others = { minimap: parts.find(b => hit(p, b)) ?? null, hint: r('[data-testid="hint-text"]')?.parentElement?.getBoundingClientRect() ?? null, footer: r('[data-testid="rail-footer"]'), rail: r('[data-testid="rail"]'), guide: r('[data-testid="range-guide"]'), leaderboard: r('[data-testid="leaderboard"]'), rangeCard: r('[data-testid="range-card"]') };
  const f = others.footer;
  return {
    panel: { dock: el.dataset.dock, place: el.dataset.place ?? null, tool: el.dataset.tool, x: Math.round(p.left), y: Math.round(p.top), w: Math.round(p.width), h: Math.round(p.height), scrollsSideways: el.scrollWidth > el.clientWidth + 1 },
    crumb: el.querySelector('[data-testid="tool-crumb"]')?.textContent ?? null,
    footer: f ? { x: Math.round(f.left), y: Math.round(f.top), w: Math.round(f.width), centre: Math.round(f.left + f.width / 2) } : null,
    gapAboveFooter: f ? Math.round(f.top - p.bottom) : null,
    overlaps: Object.entries(others).filter(([, b]) => hit(p, b)).map(([k]) => k),
  };
});
async function open(url, W, H, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(s => { try { localStorage.clear(); localStorage.setItem('capitalempire.uiScale', String(s)); } catch { /* none */ } }, scale);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.emit(); });
  await page.waitForFunction(() => window.__game.ground?.busy === 0, null, { timeout: 60000, polling: 250 }).catch(() => console.log('  (ground busy)'));
  await sleep(1500);
  return { ctx, page };
}
const shot = async (page, name) => { await page.mouse.move(5, 300); await sleep(350); await save(await page.screenshot({ type: 'png' }), name); console.log('  ', JSON.stringify(await report(page))); };
/** a flyout walk: the rail group's button, then each column's row (a key, or :first for the column's first leaf) */
async function pick(page, group, ...rows) {
  await page.keyboard.press('Escape'); await sleep(150);
  await page.click(`[data-rail="${group}"]`); await sleep(300);
  for (const [level, key] of rows.entries()) {
    const sel = key === ':first' ? `[data-flyout-col="${level}"] [role="menuitem"]:not([aria-haspopup]):not([aria-disabled])` : `[data-flyout-col="${level}"] [data-key="${key}"]`;
    await page.locator(sel).first().click(); await sleep(300);
  }
}

try {
  if (only.includes('golf')) for (const [W, H] of [[1366, 768], [1920, 1080]]) {
    const { ctx, page } = await open('?start=range', W, H);
    await pick(page, 'traffic', 'roads', 'lane'); await shot(page, `upgrade-${W}`);
    await pick(page, 'traffic', 'junctions', ':first'); await shot(page, `junctions-${W}`);
    await pick(page, 'traffic', 'transport', 'park'); await shot(page, `carpark-${W}`);
    await pick(page, 'towndecor', 'paint', 'materials', ':first'); await shot(page, `paint-town-${W}`);
    await pick(page, 'facilities', 'plants', ':first'); await shot(page, `paint-facilities-${W}`);
    // a footer panel beside the range card (and the guide card, which moves left of it): Upgrade in hand, the range card opened on top
    await pick(page, 'traffic', 'roads', 'lane');
    await page.evaluate(() => { const g = window.__game; g.openRangeCard(true); g.emit(); }); await sleep(600);
    await shot(page, `range-card-${W}`);
    await ctx.close();
  }
  // the classic town game: its hint bar (the tool's keys) stands above the footer panel; the crumb's back arrow reopens the flyouts upward
  if (only.includes('classic')) for (const [W, H] of [[1366, 768], [1920, 1080]]) {
    const { ctx, page } = await open('?start=valley', W, H);
    await pick(page, 'traffic', 'roads', 'build', ':first'); await shot(page, `classic-build-${W}`);
    const bar = await page.evaluate(() => { const h = [...document.querySelectorAll('[class*="rounded-full!"]')].map(e => e.getBoundingClientRect()).find(b => b.width), p = document.querySelector('[data-testid="tool-panel"]')?.getBoundingClientRect(); return h && p ? { hintBottom: Math.round(h.bottom), panelTop: Math.round(p.top), above: h.bottom <= p.top } : { hint: !!h }; });
    console.log('   hint bar:', JSON.stringify(bar));
    await page.click('[data-testid="tool-panel"] .tool-back'); await sleep(400);
    console.log('   back arrow:', JSON.stringify(await page.evaluate(() => ({ flyoutsUp: !!document.querySelector('[data-testid="flyouts"][data-up]'), cols: document.querySelectorAll('[data-flyout-col]').length, panelShown: !!document.querySelector('[data-testid="tool-panel"]')?.getBoundingClientRect().width }))));
    await page.mouse.move(5, 300); await sleep(200);
    await save(await page.screenshot({ type: 'png' }), `classic-back-${W}`);
    await ctx.close();
  }
  // 125% UI on a 1366 screen: Upgrade, then with the range card and the guide card beside it (the crowded screen)
  if (only.includes('ui125')) {
    const { ctx, page } = await open('?start=range', 1366, 768, 1.25);
    await pick(page, 'traffic', 'roads', 'lane'); await shot(page, 'upgrade-1366-ui125');
    await page.evaluate(() => { const g = window.__game; g.openRangeCard(true); g.emit(); }); await sleep(600);
    await shot(page, 'range-card-1366-ui125');
    await ctx.close();
  }
} finally {
  await browser.close();
}

// #1281 (the owner, 2026-11-14: "when you place the practice area it should place some dirt greens we flags and a crappy bunker etc ... if you click on the
// practice are label it takes you to the window to build the proper green ... the initial practice green you can place looks crap. remove the TEe box and make the
// bunker bigger. add some rough grass around the entire thing"): in-game check and shots of the practice area's starter set, the label's click and the first proper
// greens. On a new jam game (dev server run with VITE_JAM=1): buys the old range, places the practice area (a real click), then looks at it close up; the build window
// opened by a click on the area's label; the putting and the chipping green built (Quick build) on the desert look and the autumn look. Each step's state is checked
// and printed; a failed check exits 1.
//   VITE_JAM=1 node node_modules/vite/bin/vite.js --port 5361 --strictPort      (a scratch port of your own)
//   node scripts/dev/practice-starter-shots.mjs --base http://127.0.0.1:5361/ --out F:/wt/j6-practice/output/practice-shots [--look desert|autumn] [--steps a,b,c] [--seed 1]
// One headless Chrome, closed when done; a fresh profile, so the start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, has = k => args.includes(`--${k}`);
const base = opt('base', 'http://127.0.0.1:5361/'), out = opt('out', 'output/practice-shots'), look = opt('look', 'desert'), seed = opt('seed', ''), prefix = opt('prefix', '');
const steps = new Set(opt('steps', 'area,label,putting,chipping').split(','));
mkdirSync(out, { recursive: true });
const t0 = Date.now(), lap = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const settle = async (page, ms = 700) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name, clip) => {
  const file = join(out, `${prefix}${name}.jpg`), png = await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) });
  await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  console.log('  ' + file);
};
const look_ = (page, p, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [p.x, p.y, z]);
const game = (page, fn, arg) => page.evaluate(fn, arg);
/** the pointer on world tile p (the camera already there): css px */
const screenOf = (page, p) => page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [p.x, p.y]);
const hover = async (page, p) => { const s = await screenOf(page, p); await page.mouse.move(s.x, s.y); await page.waitForTimeout(250); return s; };

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
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
  await game(page, () => { const g = window.__game, p = g.golf.progress; g.setSpeed(0); g.prebake = () => {}; window.__night = 0; g.nightAmount = () => window.__night; if (p?.tour) p.tour.off = true; g.emit(); });
  check(await game(page, () => window.__game.desertTheme) === (look === 'desert'), `the world's look is ${look}`);
  // the old range stands for sale after the first view bakes: buy it
  await page.waitForFunction(() => { const g = window.__game; return !!g.range.scene && g.golf?.range?.forSale; }, null, { timeout: 120000 });
  lap('range offered');
  await game(page, () => { window.__game.money = Math.max(window.__game.money, 200000); });
  await game(page, () => window.__game.buyRange());
  check(await game(page, () => !window.__game.golf.range.forSale), 'the range is bought');
  // the practice area in hand, a spot for it, a real click
  await game(page, () => window.__game.placeRangePart('practice'));
  const spot = await game(page, () => {
    const g = window.__game, p = g.placing; if (!p || p.id !== 'practice') return null;
    const sc = g.range.scene, c = sc.counter, best = [];
    for (let dy = -90; dy <= 90; dy += 2) for (let dx = -90; dx <= 90; dx += 2) {
      const s = p.spot(c.x + dx, c.y + dy); if (p.why(s)) continue;
      // the nearest the car park's far side (the scene's carEdge) first
      best.push({ x: c.x + dx, y: c.y + dy, d: Math.hypot(sc.carEdge.x - (s[0] + s[2] / 2), sc.carEdge.y - (s[1] + s[3] / 2)) });
    }
    best.sort((a, b) => a.d - b.d); return best[0] ?? null;
  });
  check(!!spot, `a spot for the practice area: ${JSON.stringify(spot)}`);
  if (!spot) throw new Error('no practice spot');
  await look_(page, spot, 0.1); await settle(page, 500);
  await hover(page, spot);
  await game(page, () => { const g = window.__game; g.camEase = null; });
  const before = await game(page, () => ({ money: Math.round(window.__game.money), at: window.__game.golf.range.practiceAt }));
  const s = await screenOf(page, spot); await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(600);
  const after = await game(page, () => ({ money: Math.round(window.__game.money), at: window.__game.golf.range.practiceAt, placing: !!window.__game.placing }));
  console.log('  before', JSON.stringify(before), 'after', JSON.stringify(after));
  check(!!after.at && !after.placing, 'the click placed the practice area');
  lap('practice area placed'); await settle(page);
  const area = await game(page, () => { const a = window.__game.range.scene.practice; return { label: a.label, box: a.box }; });
  if (steps.has('area')) {
    await look_(page, area.label, 0.1); await settle(page); await shot(page, `01-area-placed-10pct`);
    await look_(page, area.label, 0.2); await settle(page); await shot(page, `02-area-placed-20pct`);
    await look_(page, area.label, 0.3); await settle(page); await shot(page, `03-area-placed-30pct`);
  }
  if (steps.has('label')) {
    // a click on the area's label: the build window
    await look_(page, area.label, 0.2); await settle(page);
    const q = await hover(page, area.label); await page.mouse.click(q.x, q.y); await page.waitForTimeout(700);
    console.log('  after the label click', JSON.stringify(await game(page, () => { const g = window.__game; return { tool: g.tool, kind: g.practice.kind, card: g.range.cardOpen, panel: g.panel, selected: g.practiceSelected ?? null }; })));
    await shot(page, `04-label-click`);
  }
  const buildOne = async (kind, name) => {
    await game(page, () => { const g = window.__game; g.armPractice(null); g.setTool('select'); g.openRangeCard(false); });
    const r = await game(page, k => window.__game.quickPractice(k), kind);
    console.log(`  quick build ${kind}:`, r === null ? 'built' : r);
    await settle(page, 1200);
    const info = await game(page, k => { const g = window.__game, f = g.range.practice?.[k]; return f ? { state: f.state, m2: f.m2, centre: f.centre, cups: f.cups.length } : null; }, kind);
    console.log('  ', kind, JSON.stringify(info));
    if (info?.centre) { await look_(page, info.centre, 0.3); await settle(page, 800); await shot(page, `${name}-30pct`); await look_(page, info.centre, 0.2); await settle(page, 600); await shot(page, `${name}-20pct`); }
    return info;
  };
  if (steps.has('chipping')) await buildOne('chipping', '05-chipping');
  if (steps.has('putting')) await buildOne('putting', '06-putting');
  lap('done');
} finally {
  if (!has('keep')) await browser.close().catch(() => {});
}
console.log(bad ? `${bad} check(s) FAILED` : 'all checks ok');
process.exit(bad ? 1 : 0);

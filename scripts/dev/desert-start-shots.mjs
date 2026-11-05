// T342 (#970): the shots: the new game's "Who are you?" card with its Autumn / Desert choice; a hole framed in a desert game (and the same in
// autumn); the Trees brush with its All / Autumn / Desert filter (and the Facilities › Plants flyout, no Palms); a river bank in the desert
// in autumn and in the desert (its damp dirt), from the same views; the hole and menu shots on the range20 fixture (?fixture=range20).
//   node scripts/dev/desert-start-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T342
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves stay in the headless profile.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/desert-start-shots'), only = opt('only', '');
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const shot = async (page, name, clip) => { const f = join(out, `${name}.jpg`); await sharp(await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) })).jpeg({ quality: 88, mozjpeg: true }).toFile(f); console.log(f); };
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { window.__night = 0; window.__game.nightAmount = () => 0; });
  return { ctx, page };
}
const settle = async (page, ms = 1500) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.perf.chunksPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
try {
  // ---- 1. the start choice: a fresh range start; the "Who are you?" card
  if (!only || only === 'start') {
    const { ctx, page } = await open('');
    await page.waitForSelector('[data-testid="who-card"]', { timeout: 120000 });
    await settle(page);
    await shot(page, 'start-choice-autumn');
    await page.click('[data-testid="who-theme-desert"]'); await settle(page, 800);
    await shot(page, 'start-choice-desert');
    // the choice is in the save: save, reload, the game comes back desert
    await page.evaluate(() => window.__game.save());
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    console.log('reloaded: desert =', await page.evaluate(() => window.__game.desertTheme));
    await ctx.close();
  }
  // ---- 2. a hole just built with New hole (Frame with trees on) in a desert game, and the same in autumn: the old start (seed 1, T229's
  //         frame shots' par 4 across the open middle of the old nine); the starter course's own holes are dressed desert too
  if (!only || only === 'hole') {
    const HOLE = { tee: { x: 640.25, y: 600.25 }, green: { x: 810.25, y: 606.25 } };
    for (const theme of ['off', 'on']) {
      const { ctx, page } = await open(`?fixture=range20&desert=${theme}`);
      const built = await page.evaluate(h => {
        const g = window.__game; g.prebake = () => {}; g.closeWelcome?.(false); g.setSpeed(0); g.setShowGrid?.(false);
        g.setTool('course'); g.paint.setFrameTrees(true);
        if (!g.paint.setPlan()) return { why: 'no plan' };
        const w = g.paint.wizard, far = () => ({ x: 1e9, y: 1e9 }); w.press(h.tee, -1e5, -1e5, far); w.press(h.green, -1e5, -1e5, far);
        const n = w.hole, ok = g.paint.buildPlan(); g.paint.setBrush(g.paint.brushKind); g.setTool('select');
        const frames = [...g.props].filter(p => p.frame === n);
        const ln = g.holeLines().get(n) ?? [h.tee, h.green], tee = ln[0], pin = ln[ln.length - 1]; return { n, ok, desert: g.desertTheme, frames: frames.length, pin, tee };
      }, HOLE);
      console.log(`hole (${theme}):`, JSON.stringify(built));
      await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
      const tag = theme === 'on' ? 'desert' : 'autumn';
      await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.15); }, [(built.tee.x + built.pin.x) / 2, (built.tee.y + built.pin.y) / 2]);
      await settle(page); await shot(page, `hole-${tag}-15`);
      // 30%: the green's edge and its frame, as the 15% view shows it (the green is where the screen says, with the ground's height)
      const t = await page.evaluate(() => { const g = window.__game; return g.tileAt(470, 330); });
      console.log('  30% at', JSON.stringify(t));
      await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.3); }, [t.x, t.y]);
      await settle(page); await shot(page, `hole-${tag}-30`);
      await ctx.close();
    }
  }
  // ---- 3. the Trees brush and its filter, and the Facilities › Plants flyout (no Palms)
  if (!only || only === 'menu') {
    const { ctx, page } = await open('?fixture=range20&desert=on');
    await page.waitForTimeout(3000);
    await page.evaluate(() => { const g = window.__game; g.closeWho?.('Tester', 2); g.closeWelcome?.(false); g.setSpeed(0); });
    const fac = await page.$('[data-rail="facilities"]');
    if (fac) {
      await fac.click(); await page.waitForTimeout(400);
      const plants = page.locator('text=Plants').first(); await plants.hover().catch(() => {}); await plants.click().catch(() => {}); await page.waitForTimeout(500);
      await shot(page, 'menu-facilities-plants');
      const trees = page.locator('text=Trees').first(); await trees.click().catch(() => console.log('  (no Trees row)')); await page.waitForTimeout(800);
    } else {
      console.log('  (no Facilities rail: the Trees brush by hand)');
      await page.evaluate(() => { const g = window.__game; g.setTool('paint'); g.paint.setPlant('trees'); });
    }
    await page.waitForSelector('[data-testid="plant-filter"]', { timeout: 20000 }).catch(() => console.log('  (no plant filter shown)'));
    await page.evaluate(() => document.querySelector('[data-testid="plant-filter"]')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(500); await shot(page, 'menu-trees-desert');
    await page.click('[data-testid="plant-filter-all"]').catch(() => {}); await page.waitForTimeout(500); await shot(page, 'menu-trees-all');
    await page.click('[data-testid="plant-filter-autumn"]').catch(() => {}); await page.waitForTimeout(500); await shot(page, 'menu-trees-autumn');
    await ctx.close();
  }
  // ---- 4. a river bank: autumn, and the desert with its damp dirt
  if (!only || only === 'river') {
    const { ctx, page } = await open('?fixture=range20&desert=off');
    await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.setSpeed(0); });
    await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
    const at = await page.evaluate(() => {
      const g = window.__game, ws = g.terrain.waters.filter(w => w.kind === 'river'), w = ws[0] ?? g.terrain.waters[0], c = g.golf?.course;
      // a river point away from the course and the town's middle (the world's water)
      let best = w.pts[Math.floor(w.pts.length / 2)], bd = -1;
      for (const p of w.pts) { if (p.x < 80 || p.y < 80 || p.x > 1968 || p.y > 1968) continue; const d = c ? Math.min(Math.abs(p.x - (c[0] + c[2] / 2)), Math.abs(p.y - (c[1] + c[3] / 2))) : 0; if (d > bd && d < 400) { bd = d; best = p; } }
      return { x: best.x, y: best.y };
    });
    console.log('river at', JSON.stringify(at));
    for (const z of [0.3, 0.12]) {
      await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [at.x, at.y, z]);
      await page.evaluate(() => window.__game.setDesertTheme(false)); await settle(page); await shot(page, `river-${Math.round(z * 100)}-autumn`);
      await page.evaluate(() => window.__game.setDesertTheme(true)); await settle(page, 600); await shot(page, `river-${Math.round(z * 100)}-desert`);
    }
    await ctx.close();
  }
} finally { await browser.close(); }

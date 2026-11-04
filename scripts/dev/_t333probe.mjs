import { chromium } from 'playwright-core';
const base = 'http://127.0.0.1:5187/';
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-position=-32000,-32000', '--window-size=1366,860', '--no-startup-window-focus'] });
const log = (...a) => console.log(...a);
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); });
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game?.youCart && !!window.__game.yrView(), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__game; window.__st = [];
    const wrap = c => new Proxy(c, { set(o, k, v) { if (k === 'z' && Math.abs(v - o.z) > 0.03) window.__st.push(`z ${o.z}->${v} ` + new Error().stack.split('\n').slice(2, 7).join(' | ')); o[k] = v; return true; } });
    let cam = wrap(g.cam);
    Object.defineProperty(g, 'cam', { get: () => cam, set: v => { if (Math.abs(v.z - cam.z) > 0.03 || Math.abs(v.X - cam.X) > 500) window.__st.push(`cam= ${cam.z}->${v.z} ` + new Error().stack.split('\n').slice(2, 7).join(' | ')); cam = wrap(v); }, configurable: true });
  });
  await page.evaluate(() => window.__game.yourRoundStart('all'));
  await page.evaluate(() => { const g = window.__game, y = g.you; g.lookAt(y.x, y.y, 0.3); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game, c = g.youCart, y = g.you; y.x = c.x + 1.5; y.y = c.y; g.youCartToggle(); });
  const tee = await page.evaluate(() => window.__game.yourRound().ball);
  await page.evaluate(({ x, y }) => window.__game.lookAt(x, y, 0.25), tee);
  await page.evaluate(({ x, y }) => { const g = window.__game, s = g.screen(x, y); g.youClick(s.x / g.dpr, s.y / g.dpr); }, tee);
  await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 60000 }).catch(() => log('no address'));
  await page.waitForTimeout(500);
  log((await page.evaluate(() => window.__st)).join('\n'));
} finally { await browser.close(); }

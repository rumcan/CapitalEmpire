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
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game.yrView(), null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  const r = await page.evaluate(async () => {
    const g = window.__game; g.yourRoundStart('all');
    const R = g.yourRound(), v = g.yrView(), h = v.holes[R.card[R.at].i], pin = h.pin;
    // the owner's flow: the Ground height brush (raise) dabbed over the green a few times
    g.money = 1e9;
    const p = g.paint; p.heightMode = 'raise'; p.heightR = 12; p.heightLevel = 5;
    const dabs = []; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) dabs.push({ x: pin.x + i * 3, y: pin.y + j * 3 });
    p.begin?.('raise ground'); p.heighting = { last: dabs[0], broke: false };
    for (const d of dabs) p.heightDabAt(d);
    const info = { toasts: (g.toasts ?? []).map?.(t => t.text ?? t).slice(-3), rev: g.courseHeight.rev, hPin: g.ballHeight(pin.x, pin.y), hOff: g.ballHeight(pin.x + 6, pin.y) };
    g.yrFlight = null; g.shot = null; g.setYourRound({ ...g.yourRound(), ball: { x: pin.x - 3, y: pin.y + 0.5 }, lie: 'green' }); g.yourJump();
    g.lookAt(pin.x - 1, pin.y, 0.3);
    await new Promise(r => setTimeout(r, 1500));
    const bp = g.breakPins(), bg = bp.length ? g.breakGridOf(bp[0]) : null;
    const buckets = [0, 0, 0, 0]; if (bg) for (let k = 0; k < bg.n; k++) { const s = bg.pts[5 * k + 4]; buckets[s <= 0.004 ? 0 : s < 0.0148 ? 1 : s < 0.0274 ? 2 : 3]++; }
    return { ...info, pin, mode: g.breakMode, shot: g.shot?.input?.club, lie: g.yourRound().lie, pins: bp, n: bg?.n, buckets, fade: g.breakFade, surfAtPin: (() => { const gr = g.courseGrid; return gr ? gr.surf[g.constructor.name && 0] : null; })() };
  });
  log(JSON.stringify(r));
  await page.screenshot({ path: 'F:/ClaudeTemp/T333/grid-probe.png' });
} finally { await browser.close(); }

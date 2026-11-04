// T333 (#959): a trace of your own round, frame by frame: where you are drawn (after the T312 spacing), whether you are drawn at all (on foot or
// riding your cart), where your cart is drawn, and the camera. It plays the owner's flow (the round started, into the cart and driven to the tee,
// the drive, walking to the ball, the second shot, Jump to ball, a held key walk at a watching speed) and reports every frame where you are
// missing and every jump (a drawn move faster than a cart runs) that is not Jump to ball. A frame strip of the walk to the ball and the jump.
//   node scripts/dev/round-trace.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T333 --headed
// Needs a dev server (vite) on --base. One Edge (--headed opens it off-screen), closed when done; saves are not written.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/round-trace'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: !args.includes('--headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', ...(args.includes('--headed') ? ['--window-position=-32000,-32000', '--window-size=1366,860', '--no-startup-window-focus'] : [])] });
const log = (...a) => console.log(...a);
let bad = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); });
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game?.youCart, null, { timeout: 90000 }).catch(() => log('no character or cart'));
  await page.waitForFunction(() => !!window.__game.yrView(), null, { timeout: 60000 }).catch(() => log('no course view'));
  await page.waitForTimeout(1500);

  // the recorder: after each frame the game draws (its rAF runs first), the drawn you (the label's drawable: after spacing), the cart's, the camera
  await page.evaluate(() => {
    const g = window.__game, T = window.__trace = [];
    window.__tag = '';
    const tick = () => {
      const lab = g.caddieLabels.find(l => l.text === g.youLabel()), name = g.golf?.player?.name ?? 'You';
      const cl = g.caddieLabels.find(l => l.text === name || l.text === 'Your cart');
      const y = g.you, c = g.youCart;
      T.push({ t: performance.now(), tag: window.__tag, z: g.cam.z, cx: g.cam.X, cy: g.cam.Y, inCart: g.youInCart,
        yx: y?.x, yy: y?.y, dx: lab ? lab.p.x : null, dy: lab ? lab.p.y : null, rx: cl ? cl.p.x : null, ry: cl ? cl.p.y : null, alpha: lab?.p.alpha ?? 1,
        jump: g.yrJumpAt ?? 0 });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const tag = t => page.evaluate(t => { window.__tag = t; }, t);
  const view = (z = 0.3) => page.evaluate(z => { const g = window.__game, y = g.you; g.lookAt(y.x, y.y, z); }, z);
  const shoot = async (acc = 0.5) => {
    await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 30000 }).catch(() => log('  no shot open'));
    await page.evaluate(acc => window.__game.ownerSwing({ power: 0.9, acc, boost: 0 }), acc);
    await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 20000 }).catch(() => log('  still flying'));
  };
  const clickTile = (x, y) => page.evaluate(({ x, y }) => { const g = window.__game, s = g.screen(x, y); g.youClick(s.x / g.dpr, s.y / g.dpr); }, { x, y });
  const strip = async (name, n, every) => { for (let k = 0; k < n; k++) { await page.screenshot({ path: join(out, `${name}-${k}.png`), clip: { x: W / 2 - 260, y: H / 2 - 170, width: 520, height: 340 } }); await page.waitForTimeout(every); } };

  // 1. the round; into the cart; drive to the tee (the snap at the tee out of the cart)
  await tag('start');
  await page.evaluate(() => window.__game.yourRoundStart('all'));
  await view(0.3); await page.waitForTimeout(800);
  await tag('cart-in');
  await page.evaluate(() => { const g = window.__game, c = g.youCart, y = g.you; if (Math.hypot(c.x - y.x, c.y - y.y) > 2.5) { y.x = c.x + 1.5; y.y = c.y; } g.youCartToggle(); });
  await page.waitForTimeout(600);
  await tag('drive-to-tee');
  const tee = await page.evaluate(() => { const g = window.__game, r = g.yourRound(); return r.ball; });
  await page.evaluate(({ x, y }) => { const g = window.__game; g.lookAt(x, y, 0.25); }, tee);
  await clickTile(tee.x, tee.y);
  await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 60000 }).catch(() => log('  no address at the tee'));
  await page.waitForTimeout(600);
  // 2. the drive, then walk to the ball (a click on it) at a watching speed, with a frame strip of the arrival
  await tag('drive'); await shoot(0.5);
  await page.evaluate(() => window.__game.setSpeed(0.25)).catch(() => {});
  await tag('walk-to-ball');
  const ball = await page.evaluate(() => window.__game.yourRound().ball);
  await page.evaluate(() => { const g = window.__game, y = g.you; y.x = g.yourRound().ball.x - 9; y.y = g.yourRound().ball.y - 3; }); // (a short walk: 9.5 tiles out)
  await page.waitForTimeout(200);
  await page.evaluate(({ x, y }) => { const g = window.__game; g.lookAt(x - 3, y - 1, 0.32); }, ball);
  await clickTile(ball.x, ball.y);
  await page.waitForTimeout(3500);
  await strip('walk-arrive', 8, 450);
  await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 30000 }).catch(() => log('  no address at the ball'));
  await page.waitForTimeout(800);
  // 3. the second shot, then Jump to ball (the only jump), a strip of it
  await tag('second'); await shoot(0.5);
  await view(0.3); await page.waitForTimeout(300);
  await tag('jump');
  const jb = await page.evaluate(() => window.__game.yourRound().ball);
  await page.evaluate(({ x, y }) => window.__game.lookAt(x, y, 0.3), jb);
  await page.evaluate(() => window.__game.yourJump());
  await strip('jump', 6, 120);
  await page.waitForTimeout(600);
  // 4. a held key walk away and back (T330), the shot open: it closes when you walk off
  await tag('keys');
  await page.keyboard.down('d'); await page.waitForTimeout(1200); await page.keyboard.up('d');
  await page.keyboard.down('a'); await page.waitForTimeout(1200); await page.keyboard.up('a');
  await page.waitForTimeout(800);
  await tag('end');

  const T = await page.evaluate(() => window.__trace);
  writeFileSync(join(out, 'trace.json'), JSON.stringify(T));
  // the faults: a frame with you missing at the street zoom; a drawn move faster than JUMP_V tiles/s (a cart runs at 3.4) but Jump to ball's
  const JUMP_V = 6, missing = [], jumps = [];
  for (let k = 1; k < T.length; k++) {
    const a = T[k - 1], b = T[k], dt = Math.max(1 / 240, (b.t - a.t) / 1000);
    if (b.z < 0.12) continue;
    const onScreen = b.yx !== undefined;
    if (onScreen && b.dx === null && !(b.inCart && b.rx !== null)) missing.push({ k, tag: b.tag, inCart: b.inCart });
    const pa = a.dx !== null ? [a.dx, a.dy] : a.inCart && a.rx !== null ? [a.rx, a.ry] : null, pb = b.dx !== null ? [b.dx, b.dy] : b.inCart && b.rx !== null ? [b.rx, b.ry] : null;
    if (pa && pb) { const v = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / dt, d = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]); if (v > JUMP_V && d > 0.15 && b.jump === a.jump) jumps.push({ k, tag: b.tag, d: +d.toFixed(2), inCart: [a.inCart, b.inCart] }); }
  }
  log(`frames ${T.length}; missing ${missing.length}; jumps (not Jump to ball) ${jumps.length}`);
  const sum = xs => Object.entries(xs.reduce((m, x) => (m[x.tag] = (m[x.tag] ?? 0) + 1, m), {})).map(([k, v]) => `${k}:${v}`).join(' ');
  if (missing.length) log('  missing by step', sum(missing), JSON.stringify(missing.slice(0, 5)));
  if (jumps.length) log('  jumps', JSON.stringify(jumps.slice(0, 12)));
  bad = missing.length + jumps.length;
} finally { await browser.close(); }
process.exitCode = bad ? 1 : 0;

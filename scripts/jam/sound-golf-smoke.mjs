// J11 (#1270): the golf view's sounds, in the real page (the installed Chrome, playwright-core): a hole is built the way jam:smoke builds one, "Play this hole" opens the view
// in its iframe, and a swing is held with Space and let go. What is checked: the view makes no AudioContext of its own (host mode: its sounds are messages), the host plays what it
// is sent (the heartbeat while the power builds, the breath, the swish and the strike of the club, the landing on its surface) through the one context, nothing breaks, and the
// range ambience (a camera close on the bought range) builds a breeze and plays distant strikes.
//   node scripts/jam/sound-golf-smoke.mjs [--url http://127.0.0.1:PORT/] [--shots DIR] [--headed]       (serves dist-jam without --url; never 5174, 5175, 5191, 5270 or 5280)
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { createServer } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve('.'), OUT = 'dist-jam', SHOTS = opt('shots', null);
if (SHOTS) mkdirSync(resolve(SHOTS), { recursive: true });
let server = null, base = opt('url', null);
if (!base) {
  if (!existsSync(resolve(ROOT, OUT, 'index.html'))) { console.error(`no ${OUT}/index.html: run npm run build:jam first, or pass --url`); process.exit(2); }
  const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
  const port = await freePort();
  server = await preview({ root: ROOT, logLevel: 'error', build: { outDir: OUT }, preview: { port, strictPort: true, host: '127.0.0.1' } });
  base = `http://127.0.0.1:${port}/`;
}
const rows = [], errors = [];
const check = (name, ok, note = '') => { rows.push({ name, ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, acceptDownloads: false });
await ctx.addInitScript(() => {
  try { localStorage.clear(); } catch { /* none */ }
  const S = window.__snd = { ctx: 0, osc: 0, src: 0, loops: 0, loopStops: 0, strikes: 0, msgs: [] };
  const AC = window.AudioContext;
  window.AudioContext = class extends AC { constructor(...a) { super(...a); S.ctx++; } };
  for (const [P, k] of [[window.OscillatorNode.prototype, 'osc'], [window.AudioBufferSourceNode.prototype, 'src']]) { const o = P.start; P.start = function (...a) { S[k]++; if (this.loop) S.loops++; return o.apply(this, a); }; }
  { const P = window.AudioBufferSourceNode.prototype, o = P.stop; P.stop = function (...a) { if (this.loop) S.loopStops++; return o.apply(this, a); }; } // (the breeze is the one looped source)
  window.addEventListener('message', e => { try { const d = e.data; if (d && d.v === 1 && d.t === 'sound') S.msgs.push(d.k + (d.club ? ':' + d.club : '') + (d.mat ? ':' + d.mat : '')); } catch { /* ignore */ } }, true);
});
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`); });
const settle = (ms = 400) => page.waitForTimeout(ms);
const game = fn => page.evaluate(fn);
const snd = () => page.evaluate(() => ({ ctx: __snd.ctx, nodes: __snd.osc + __snd.src, loops: __snd.loops, loopStops: __snd.loopStops, msgs: [...__snd.msgs] }));
const shot = async name => { if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `${name}.png`) }); };

try {
  console.log(`sound golf smoke: ${base} (Chrome ${browser.version()})`);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.locator('[data-testid="title-card"]').waitFor({ timeout: 400000 });
  await page.locator('[data-testid="title-new"]').click();
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  const who = page.locator('button', { hasText: "That's me" }); await who.waitFor({ timeout: 60000 }); await who.click(); await settle(1200);
  await game(() => window.__game.setSpeed(0));
  // ---- the range ambience: buy the range, put the camera close on it
  await page.locator('[data-rail="build"]').click(); await page.locator('[data-testid="build-menu"]').waitFor({ timeout: 8000 });
  await page.locator('[data-testid="build-tab-range"]').click();
  await page.locator('[data-testid="build-card-range"]').click(); await settle(1500);
  await page.keyboard.press('Escape'); await game(() => { const g = window.__game; g.openRangeCard?.(false); g.setTool('select'); g.setSpeed(1); const c = g.range.scene?.counter; if (c) g.lookAt(c.x, c.y, 0.25); g.emit(); });
  await settle(6000);
  const amb = await snd();
  check('the range ambience builds a breeze: a looped noise source starts when the camera is close on the range', amb.loops === 1, JSON.stringify({ ctx: amb.ctx, loops: amb.loops, stops: amb.loopStops }));
  await shot('range-close');
  // the camera goes far away: the breeze fades and its nodes are freed a few seconds after
  await game(() => { const g = window.__game; g.zoomAt(0.03); g.emit(); }); await settle(7000);
  const far = await snd();
  check('zoomed out, the breeze is stopped and its nodes freed', far.loopStops >= 1, JSON.stringify({ loops: far.loops, stops: far.loopStops }));
  await game(() => { const g = window.__game; g.setSpeed(0); });
  // ---- a hole built through the wizard, as jam:smoke builds it
  const built = await game(() => {
    const g = window.__game; g.paint.host.planLock = () => null;
    const P = g.golf.parcel, p = g.paint, w = p.wizard; g.setTool('course'); if (g.tool !== 'course') return 'no course tool';
    for (let y = P[1] + 20; y < P[1] + P[3] - 20; y += 30) for (let x = P[0] + 20; x < P[0] + P[2] - 20; x += 30) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const gx = x + dx * 60, gy = y + dy * 60; if (gx < P[0] + 10 || gy < P[1] + 10 || gx > P[0] + P[2] - 10 || gy > P[1] + P[3] - 10) continue;
      if (!p.setPlan()) return 'no plan'; p.pointerDown({ x, y }, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'green') { p.cancelPlan(); continue; }
      p.pointerDown({ x: gx, y: gy }, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'shape') { p.cancelPlan(); continue; }
      if (!w.check().ok) { p.cancelPlan(); continue; } p.buildPlan(); g.setTool('select'); return 'ok';
    }
    return 'no spot';
  });
  check('a hole was built through the wizard', built === 'ok', built);
  if (built === 'ok') {
    await game(() => { const g = window.__game; g.holeCardHole = 1; g.emit(); }); await settle(800);
    await page.locator('[data-testid="hole-play-3p"]').click({ timeout: 8000 }); await settle(2000);
    await page.waitForFunction(() => { const f = document.querySelector('iframe'); try { return !!f?.contentDocument?.querySelector('canvas'); } catch { return false; } }, null, { timeout: 180000 });
    const frame = page.frames().find(f => f !== page.mainFrame());
    await page.waitForFunction(() => !document.querySelector('[data-testid="view3p-state"]'), null, { timeout: 180000 }).catch(() => {});
    // the first turn (the host sends it once the course is on screen and the lies are read)
    let turn = false; for (let k = 0; k < 90 && !turn; k++) { turn = await frame.evaluate(() => typeof HP !== 'undefined' && !!HP && !!HP.turn).catch(() => false); if (!turn) await settle(1000); }
    check('the view is on screen and has its first turn', turn);
    const own = await frame.evaluate(() => ({ ac: typeof AC !== 'undefined' ? !!AC : false, host: typeof HOST !== 'undefined' ? HOST : null }));
    check('the view runs in host mode and makes no AudioContext of its own', own.host === true && own.ac === false, JSON.stringify(own));
    await shot('golf-view');
    if (turn) {
      await frame.evaluate(() => { if (typeof jumpToBall === 'function') jumpToBall(); }).catch(() => {}); await settle(600);
      const before = await snd();
      await page.keyboard.down('Space'); await settle(1100); await page.keyboard.up('Space');
      await settle(9000); // the swing, the strike, the flight, the landing, the roll
      const after = await snd(), kinds = after.msgs.slice(before.msgs.length), seen = k => kinds.some(m => m === k || m.startsWith(k + ':'));
      check('the view sent the heartbeat, the breath, the swish and the strike', seen('heart') && seen('breath') && seen('swish') && seen('strike'), kinds.join(' '));
      check('and the landing, with a surface', seen('land'), kinds.filter(m => m.startsWith('land')).join(' '));
      check('the host played them (new sound nodes), through the one context', after.nodes > before.nodes && after.ctx === 1, `nodes ${before.nodes} -> ${after.nodes}, contexts ${after.ctx}`);
      await shot('golf-view-after-shot');
    }
  }
} catch (e) {
  check('the run finished', false, String(e.message ?? e).split('\n')[0]);
} finally {
  if (errors.length) for (const e of errors) console.log(`  ${e}`);
  check('no console error', errors.length === 0, `${errors.length} error(s)`);
  await browser.close().catch(() => {});
  if (server) { await server.close?.().catch?.(() => {}); server.httpServer?.close?.(); }
}
const bad = rows.filter(r => !r.ok);
console.log(`\n${rows.length} checks, ${bad.length} fail`);
process.exit(bad.length ? 1 : 0);

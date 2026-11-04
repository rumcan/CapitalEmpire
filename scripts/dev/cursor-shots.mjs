// T323 (#921): the rail's two cursors (Walk, Select) in the real game: the rail in each mode, Alt swaps them, a click walks only in Walk, the
// camera stays put while you walk. A headless Edge's GPU often fails on this PC: use --headed.
//   node scripts/dev/cursor-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T323 [--headed]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/cursor-shots'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: !process.argv.includes('--headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
let fails = 0; const check = (ok, what) => { log(ok ? 'PASS' : 'FAIL', what); if (!ok) fails++; };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.waitForFunction(() => !!window.__game?.you, null, { timeout: 60000 }).catch(() => log('no character'));
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.youMe(); g.cam.z = 0.24; g.emit(); });
  await page.waitForTimeout(2500);
  const st = () => page.evaluate(() => { const g = window.__game, y = g.you; return { walk: g.youWalkMode, tool: g.tool, x: y.x, y: y.y, moving: y.moving, camX: g.cam.X, camY: g.cam.Y, saved: localStorage.getItem('capitalempire.cursorMode') }; });
  const rail = async name => { const b = await page.locator('[data-testid=rail]').boundingBox(); await page.screenshot({ path: join(out, name), clip: { x: b.x, y: b.y, width: b.width + 4, height: Math.min(b.height, 420) } }); };
  const s0 = await st(); check(s0.walk === true, 'Walk is the cursor at first');
  await page.screenshot({ path: join(out, 'game-walk.png') });
  await rail('rail-walk.png');
  // a click in Walk mode walks you; the camera does not move while you walk
  const sc = await page.evaluate(() => { const g = window.__game, y = g.you, s = g.screen(y.x + 8, y.y + 3); return { x: s.x / g.dpr, y: s.y / g.dpr }; });
  await page.mouse.move(sc.x, sc.y); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(1500);
  const s1 = await st(); check(Math.hypot(s1.x - s0.x, s1.y - s0.y) > 0.5, `Walk: the click walked you (${(Math.hypot(s1.x - s0.x, s1.y - s0.y)).toFixed(2)} tiles)`);
  check(Math.abs(s1.camX - s0.camX) < 1e-6 && Math.abs(s1.camY - s0.camY) < 1e-6, 'the camera stayed put while you walked');
  // WASD walk in Walk mode; the camera stays
  await page.keyboard.down('d'); await page.waitForTimeout(700); await page.keyboard.up('d'); await page.waitForTimeout(200);
  const s1b = await st(); check(s1b.x !== s1.x || s1b.y !== s1.y, 'D walked you'); check(s1b.camX === s1.camX && s1b.camY === s1.camY, 'the camera stayed put on D');
  // Alt (a lone tap) swaps to Select, remembered
  await page.keyboard.press('Alt'); await page.waitForTimeout(300);
  const s2 = await st(); check(s2.walk === false && s2.saved === 'select', 'Alt swapped to Select (remembered)');
  await page.mouse.move(W / 2, H / 2); await page.waitForTimeout(200);
  await page.screenshot({ path: join(out, 'game-select.png') });
  await rail('rail-select.png');
  // a click in Select mode does not walk you
  const sc2 = await page.evaluate(() => { const g = window.__game, y = g.you, s = g.screen(y.x - 6, y.y + 2); return { x: s.x / g.dpr, y: s.y / g.dpr }; });
  await page.mouse.move(sc2.x, sc2.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(1200);
  const s3 = await st(); check(!s3.moving && Math.hypot(s3.x - s2.x, s3.y - s2.y) < 0.01, 'Select: the click did not walk you');
  // WASD walk you in Select mode too
  await page.keyboard.down('w'); await page.waitForTimeout(600); await page.keyboard.up('w'); await page.waitForTimeout(200);
  const s4 = await st(); check(s4.x !== s3.x || s4.y !== s3.y, 'W walked you in Select'); check(s4.camX === s3.camX && s4.camY === s3.camY, 'the camera stayed put on W');
  // the arrows pan the camera
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(400); await page.keyboard.up('ArrowLeft');
  const s5 = await st(); check(s5.camX !== s4.camX && s5.x === s4.x, 'ArrowLeft panned the camera, you stood');
  // the rail's walking figure takes Walk again; Alt+key never swaps
  await page.click('[data-testid=cursor-walk]'); await page.waitForTimeout(300);
  const s6 = await st(); check(s6.walk === true && s6.saved === 'walk', 'the rail\'s walking figure: Walk');
  await page.click('[data-testid=cursor-select]'); await page.waitForTimeout(300);
  check((await st()).walk === false, 'the rail\'s pointer: Select');
  await page.keyboard.down('Alt'); await page.keyboard.press('x'); await page.keyboard.up('Alt'); await page.waitForTimeout(200);
  check((await st()).walk === false, 'Alt+X did not swap');
  await page.keyboard.press('Alt'); await page.waitForTimeout(200);
  check((await st()).walk === true, 'Alt swapped back to Walk');
  // remembered over a reload (the init script clears storage, so read it straight)
  check(await page.evaluate(() => localStorage.getItem('capitalempire.cursorMode')) === 'walk', 'saved: walk');
} finally { await browser.close(); }
log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);

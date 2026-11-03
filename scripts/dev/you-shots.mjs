// T240 (#704): your character, as the game draws it (a headless Edge on the dev server): the "Who are you?" card, walking along a path (a frame
// strip), the hover verbs (walk, talk, look, use), talking to a person, and at the range (a bucket at a mat).
//   node scripts/dev/you-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T240 [--only who,walk,hover,talk,range,keys]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/you-shots'), W = 1366, H = 860;
const only = new Set(opt('only', 'who,walk,hover,talk,range,keys').split(','));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.waitForFunction(() => !!window.__game?.you, null, { timeout: 60000 }).catch(() => log('no character'));
  await settle(page, 1500);
  const you = () => page.evaluate(() => { const y = window.__game.you; return y && { x: +y.x.toFixed(2), y: +y.y.toFixed(2), face: y.face, moving: y.moving, run: y.run, skip: y.skip, path: y.path.length / 2 }; });
  log('you', JSON.stringify(await you()));
  /** the screen point (css px) of tile (x, y) */
  const scr = (x, y) => page.evaluate(([x, y]) => { const g = window.__game, s = g.screen(x, y); return { x: s.x / g.dpr, y: s.y / g.dpr }; }, [x, y]);
  if (only.has('who')) {
    await page.waitForSelector('[data-testid=who-card]', { timeout: 30000 }).catch(() => log('no who card'));
    await page.fill('[data-testid=who-name]', 'Jack Burns').catch(() => {});
    await page.click('[data-testid=who-look-2]').catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(out, 'who-card.png') });
    await page.click('[data-testid=who-go]').catch(() => log('no who-go'));
    await page.waitForTimeout(400);
    await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); });
    log('after who', await page.evaluate(() => { const p = window.__game.golf.player; return JSON.stringify({ name: p.name, sex: p.sex, you: p.you }); }));
  } else await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); });
  await page.evaluate(() => { const g = window.__game; g.youMe(); g.cam.z = 0.24; g.emit(); });
  await settle(page, 1200);
  await page.screenshot({ path: join(out, 'at-start.png') });
  if (only.has('walk')) {
    // a walk to a spot 14 tiles off along the range's path: frames every 0.6 s, a strip
    const t = await page.evaluate(() => { const g = window.__game, sc = g.range.scene, y = g.you; return sc ? { x: sc.carEdge.x, y: sc.carEdge.y, fx: y.x, fy: y.y } : null; });
    log('walk target', JSON.stringify(t));
    if (t) {
      const p = await scr(t.x, t.y);
      await page.mouse.move(p.x, p.y); await page.waitForTimeout(200);
      await page.mouse.down(); await page.mouse.up();
      await page.waitForTimeout(100);
      log('walking', JSON.stringify(await you()));
      const shots = [];
      for (let k = 0; k < 6; k++) { await page.waitForTimeout(700); shots.push(await page.screenshot()); }
      const crop = { left: Math.round(W / 2 - 260), top: Math.round(H / 2 - 200), width: 520, height: 400 };
      const tiles = await Promise.all(shots.map(b => sharp(b).extract(crop).resize(260, 200).png().toBuffer()));
      await sharp({ create: { width: 260 * 6, height: 200, channels: 4, background: '#000' } }).composite(tiles.map((b, i) => ({ input: b, left: i * 260, top: 0 }))).png().toFile(join(out, 'walk-strip.png'));
      await page.screenshot({ path: join(out, 'walking.png') });
      await page.waitForFunction(() => !window.__game.you.moving, null, { timeout: 60000 }).catch(() => log('walk never ended'));
      log('arrived', JSON.stringify(await you()));
    }
  }
  await page.evaluate(() => { const g = window.__game; g.openRangeCard(false); g.closeScene(); g.closeYouTalk(); g.youMe(); g.cam.z = 0.24; });
  await page.waitForTimeout(500);
  if (only.has('hover')) {
    // the verbs: hover over open ground, the range's front, a building and a person, each shot with the cursor's label
    const pts = await page.evaluate(() => {
      const g = window.__game, sc = g.range.scene, out = {};
      if (sc) { const pc = [...g.props].find(p => p.auto?.startsWith('range:') && Math.hypot(p.x - g.you.x, p.y - g.you.y) < 30); out.range = pc ? { x: (pc.x0 + pc.x1) / 2, y: (pc.y0 + pc.y1) / 2 } : sc.counter; out.practice = sc.practice.label; out.ground = { x: g.you.x + 6, y: g.you.y - 6 }; }
      const b = g.bizDefs.find(d => d.type !== 'range' && d.type !== 'clubhouse'); if (b) out.building = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      return out;
    });
    for (const [k, p] of Object.entries(pts)) {
      const s = await scr(p.x, p.y); await page.mouse.move(s.x, s.y); await page.waitForTimeout(300);
      log('hover', k, JSON.stringify(await page.evaluate(() => window.__game.youHover)));
      await page.screenshot({ path: join(out, `hover-${k}.png`), clip: { x: Math.max(0, s.x - 220), y: Math.max(0, s.y - 160), width: 460, height: 320 } });
    }
  }
  if (only.has('talk')) {
    await page.evaluate(async () => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), 660, T.town.rate)); });
    await page.waitForFunction(() => window.__game.range.sim.view().people.slice(0, window.__game.range.sim.view().nPeople).some(q => !q.lift), null, { timeout: 60000 }).catch(() => log('no range golfers'));
    // a townsperson near you: hover (Talk to ...), click, walk up, the talk card
    const rg = await page.evaluate(() => { const g = window.__game, d = g.range.sim.view(); for (let k = 0; k < d.nPeople; k++) { const q = d.people[k]; if (!q.lift) return { x: q.x, y: q.y }; } return null; });
    log('range golfer', JSON.stringify(rg));
    if (rg) {
      await page.evaluate(([x, y]) => window.__game.lookAt(x, y, 0.28), [rg.x, rg.y]); await page.waitForTimeout(300);
      const rq = await page.evaluate(() => { const g = window.__game, d = g.range.sim.view(); for (let k = 0; k < d.nPeople; k++) { const q = d.people[k]; if (!q.lift) return { x: q.x, y: q.y }; } return null; });
      const s = await scr(rq.x, rq.y); await page.mouse.move(s.x, s.y - 14); await page.waitForTimeout(250);
      log('hover golfer', JSON.stringify(await page.evaluate(() => window.__game.youHover)));
      await page.screenshot({ path: join(out, 'hover-person.png'), clip: { x: Math.max(0, s.x - 220), y: Math.max(0, s.y - 160), width: 460, height: 320 } });
      await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(200);
      await page.waitForFunction(() => !window.__game.you.moving, null, { timeout: 90000 }).catch(() => log('talk walk never ended'));
      await page.waitForTimeout(400);
      log('talk', JSON.stringify(await page.evaluate(() => window.__game.youTalk)));
      await page.evaluate(() => { window.__game.youMe(); window.__game.cam.z = 0.28; }); await page.waitForTimeout(800);
      await page.screenshot({ path: join(out, 'talk.png') });
      await page.evaluate(() => window.__game.closeYouTalk());
    }
    const ped = await page.evaluate(() => { const g = window.__game, y = g.you, P = g.peds; let best = null, bd = 1e9; for (let i = 0; i < P.n; i++) { if (P.inside[i]) continue; const d = Math.hypot(P.x[i] - y.x, P.y[i] - y.y); if (d < bd) { bd = d; best = { x: P.x[i], y: P.y[i], d }; } } return best; });
    log('nearest person', JSON.stringify(ped));
    if (ped && ped.d < 200) {
      await page.evaluate(([x, y]) => window.__game.lookAt(x, y, 0.26), [ped.x, ped.y]); await page.waitForTimeout(300);
      const q = await page.evaluate(() => { const g = window.__game, y = g.you, P = g.peds; let best = null, bd = 1e9; for (let i = 0; i < P.n; i++) { if (P.inside[i]) continue; const d = Math.hypot(P.x[i] - g.tileAt(g.cw / 2 / g.dpr, g.ch / 2 / g.dpr).x, P.y[i] - g.tileAt(g.cw / 2 / g.dpr, g.ch / 2 / g.dpr).y); if (d < bd) { bd = d; best = { x: P.x[i], y: P.y[i] }; } } return best; });
      const s = await scr(q.x, q.y); await page.mouse.move(s.x, s.y - 12); await page.waitForTimeout(250);
      log('hover person', JSON.stringify(await page.evaluate(() => window.__game.youHover)));
      await page.screenshot({ path: join(out, 'hover-person.png'), clip: { x: Math.max(0, s.x - 220), y: Math.max(0, s.y - 160), width: 460, height: 320 } });
      await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(200);
      await page.evaluate(() => window.__game.youSkip());
      await page.waitForFunction(() => !window.__game.you.moving, null, { timeout: 90000 }).catch(() => log('talk walk never ended'));
      await page.waitForTimeout(500);
      log('talk', JSON.stringify(await page.evaluate(() => window.__game.youTalk)));
      await page.evaluate(() => window.__game.youMe()); await page.waitForTimeout(800);
      await page.screenshot({ path: join(out, 'talk.png') });
      await page.evaluate(() => window.__game.closeYouTalk());
    }
  }
  if (only.has('range')) {
    // the range: click its counter, walk there, the card; a bucket (money for it), you walk to a mat and swing
    await page.evaluate(async () => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), 600, T.town.rate)); });
    await page.waitForTimeout(600);
    const c = await page.evaluate(() => { const g = window.__game; g.youMe(); g.cam.z = 0.24; const pc = [...g.props].filter(p => p.auto?.startsWith('range:')).sort((a, b) => Math.hypot(a.x - g.you.x, a.y - g.you.y) - Math.hypot(b.x - g.you.x, b.y - g.you.y))[0]; return pc ? { x: (pc.x0 + pc.x1) / 2, y: (pc.y0 + pc.y1) / 2 } : g.range.scene.counter; });
    await page.waitForTimeout(500);
    const s = await scr(c.x, c.y); await page.mouse.move(s.x, s.y); await page.waitForTimeout(250);
    log('hover range', JSON.stringify(await page.evaluate(() => window.__game.youHover)));
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(() => !window.__game.you.moving, null, { timeout: 90000 }).catch(() => log('range walk never ended'));
    await page.waitForTimeout(400);
    log('range card', await page.evaluate(() => window.__game.range.cardOpen));
    await page.evaluate(() => window.__game.youPractise('bucket'));
    log('toast', JSON.stringify(await page.evaluate(() => window.__game.toasts.slice(-1).map(t => t.text))));
    await page.waitForTimeout(300);
    log('to a mat', JSON.stringify(await you()));
    await page.waitForFunction(() => !window.__game.you.moving, null, { timeout: 90000 }).catch(() => log('mat walk never ended'));
    await page.evaluate(() => { const g = window.__game; g.openRangeCard(false); g.youMe(); });
    const shots = [];
    for (let k = 0; k < 6; k++) { await page.waitForTimeout(330); shots.push(await page.screenshot()); }
    const crop = { left: Math.round(W / 2 - 160), top: Math.round(H / 2 - 170), width: 320, height: 260 };
    const tiles = await Promise.all(shots.map(b => sharp(b).extract(crop).png().toBuffer()));
    await sharp({ create: { width: 320 * 6, height: 260, channels: 4, background: '#000' } }).composite(tiles.map((b, i) => ({ input: b, left: i * 320, top: 0 }))).png().toFile(join(out, 'range-swing-strip.png'));
    await page.screenshot({ path: join(out, 'at-range.png') });
    log('swing', JSON.stringify(await page.evaluate(() => window.__game.you.swing)));
  }
  if (only.has('keys')) {
    const a = await you();
    await page.keyboard.down('d'); await page.waitForTimeout(1500); await page.keyboard.up('d');
    const b = await you();
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowUp');
    const c = await you();
    log('keys', JSON.stringify({ a, b, c, tool: await page.evaluate(() => window.__game.tool) }));
    await page.screenshot({ path: join(out, 'keys.png') });
  }
  await ctx.close();
} finally { await browser.close(); }

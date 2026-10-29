// T242 (#702): in-game shots of the set-the-scene cards at 1366 x 768 (the smallest screen the card must fit):
// - range: a new range start (?start=range): a real Select click on the shack opens the range card and its picture (range-click); the card on
//   each view run-down (range-rundown-<view>, card only) and the whole screen (range-rundown); then the upgrades built, the putting green
//   open and the home smartened (the save's state set), each view upgraded (range-upgraded-<view>) and the whole screen (range-upgraded);
// - home: a click on the caravan opens its picture (home-caravan, whole screen);
// - video: the grown town (?fixture=range20; --town <url> for another): a lot drawn as world:video or world:video_rental, clicked: outside and inside (video-<state>-<view>),
//   run-down as built, then upgraded (the lot's level set to upgraded);
// - farm: a farmhouse clicked, when the map has a farm (farm).
//   node scripts/dev/scene-shots.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T242 [--only range,video,farm] [--town <url>]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/scene-shots'), only = opt('only', ''), W = 1366, H = 768;
const want = k => !only || only.split(',').includes(k);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const save = async (buf, name) => { const file = join(out, `${name}.png`); await sharp(buf).png().toFile(file); console.log(file); return file; };
const settle = async (page, ms = 1200) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
/** the picture shown has loaded (or there is none) */
const picture = page => page.waitForFunction(() => { const i = document.querySelector('[data-testid="scene-picture"]'); return !i || (i.complete && i.naturalWidth > 0); }, null, { timeout: 20000 }).catch(() => console.log('  (picture not loaded)'));
const card = async (page, name) => { await picture(page); await page.waitForTimeout(250); const el = page.locator('[data-testid="scene-card"]'); if (!(await el.count())) { console.log(`  no card for ${name}`); return; } await save(await el.screenshot({ type: 'png' }), name); };
const whole = async (page, name) => { await picture(page); await page.waitForTimeout(250); await save(await page.screenshot({ type: 'png' }), name); };
const info = page => page.evaluate(() => { const c = document.querySelector('[data-testid="scene-card"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { scene: c.getAttribute('data-scene'), state: c.getAttribute('data-state'), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], line: document.querySelector('[data-testid="scene-line"]')?.textContent, scrollW: c.scrollWidth - c.clientWidth }; });
/** a screen point (css px) where Select's click picks the prop: searched up from its footprint's middle (a building stands up the screen) */
const pointOn = (page, pred) => page.evaluate(src => {
  const g = window.__game, test = new Function('p', `return (${src})(p)`), all = [...g.props].filter(p => test(p));
  const rect = (g.overlay ?? g.canvas)?.getBoundingClientRect?.() ?? { left: 0, top: 0 }, d = g.dpr || 1;
  for (const p of all) {
    const c = g.screen((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2), cx = c.x / d, cy = c.y / d;
    for (let dy = 0; dy >= -260; dy -= 6) for (let dx = -40; dx <= 40; dx += 8) { const x = cx + dx, y = cy + dy; if (x > 300 && x < g.cssW - 360 && y > 120 && y < g.cssH - 120 && g.propAt(x, y) === p) return { x: x + rect.left, y: y + rect.top, auto: p.auto, n: all.length }; }
  }
  return { n: all.length };
}, pred.toString());
const open = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.setSpeed?.(0); g.emit(); });
  await settle(page, 2000);
};
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  return { ctx, page };
};

try {
  if (want('range')) {
    const { ctx, page } = await newPage();
    await open(page, `${base}?start=range&seed=7`);
    const views = ['road', 'bays', 'shop', 'green', 'home'];
    // the shack: a real click with Select
    await page.evaluate(() => { const g = window.__game, sc = g.range.scene; g.setTool('select'); g.camEase = null; g.lookAt(sc.counter.x, sc.counter.y, 0.3); g.emit(); });
    await settle(page, 1500);
    const at = await pointOn(page, p => p.auto === 'range:shop');
    console.log('shack at', JSON.stringify(at));
    if (at.x) { await page.mouse.click(at.x, at.y); await page.waitForTimeout(400); console.log('  after the click:', JSON.stringify(await info(page)), 'range card:', await page.locator('[data-testid="range-card"]').count()); await whole(page, 'range-click'); }
    await page.evaluate(() => { const g = window.__game; g.openRangeCard(true); g.openScene({ kind: 'range', view: 'road' }); });
    await whole(page, 'range-rundown'); console.log('  ', JSON.stringify(await info(page)));
    for (const v of views) { await page.evaluate(v => window.__game.sceneView(v), v); await card(page, `range-rundown-${v}`); }
    // the home: a click on the caravan
    await page.evaluate(() => { const g = window.__game; g.closeScene(); g.openRangeCard(false); const c = [...g.props].find(p => p.auto === 'range:caravan'); if (c) { g.camEase = null; g.lookAt((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, 0.3); } g.emit(); });
    await settle(page, 1200);
    const home = await pointOn(page, p => p.auto === 'range:caravan');
    console.log('caravan at', JSON.stringify(home));
    if (home.x) { await page.mouse.click(home.x, home.y); await page.waitForTimeout(400); console.log('  after the click:', JSON.stringify(await info(page))); await whole(page, 'home-caravan'); }
    // the range built up: the save's state set (every upgrade, the putting green open, the takings past the caravan's smartening)
    await page.evaluate(() => {
      const g = window.__game, b = g.golf.range;
      for (const u of ['teeturf', 'grass', 'greens', 'gravel', 'pave', 'bays8', 'targets', 'covered', 'lights', 'dispenser', 'proshop', 'kiosk']) if (!b.owned.includes(u)) b.owned.push(u);
      b.practice.putting.open = true; b.total.takings = 60000; b.season.takings = 41250; b.season.buckets = 6100;
      g.range.sync(true); g.closeScene(); g.emit();
    });
    // the event: a range view's picture turned, so a toast offers its card (Set the scene)
    const toast = await page.waitForSelector('[data-testid="toast-scene"]', { timeout: 6000 }).catch(() => null);
    console.log('  toast:', toast ? await page.evaluate(() => document.querySelector('[data-testid="toast-scene"]')?.parentElement?.textContent) : '(none)');
    if (toast) { const b = await page.evaluate(() => { const r = document.querySelector('[data-testid="toast-scene"]').parentElement.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); await save(await page.screenshot({ type: 'png', clip: { x: Math.max(0, b.x - 120), y: Math.max(0, b.y - 110), width: Math.min(W, b.w + 240), height: b.h + 130 } }), 'range-toast'); }
    // (the putting green as the range reads it: built and open; a stand-in for painting one in the practice area)
    const green = () => page.evaluate(() => { const r = window.__game.range; if (r.practice?.putting) r.practice.putting = { ...r.practice.putting, state: 'open' }; return r.practiceFacts?.()?.putting; });
    await settle(page, 2500);
    await page.evaluate(() => { const g = window.__game, sc = g.range.scene; g.camEase = null; g.lookAt(sc.counter.x, sc.counter.y, 0.3); g.openRangeCard(true); g.openScene({ kind: 'range', view: 'road' }); });
    await settle(page, 1500);
    await page.evaluate(() => window.__game.openScene({ kind: 'range', view: 'road' }));
    await whole(page, 'range-upgraded'); console.log('  ', JSON.stringify(await info(page)));
    for (const v of views) { if (v === 'green') console.log('  the putting green reads', await green()); await page.evaluate(v => window.__game.sceneView(v), v); await card(page, `range-upgraded-${v}`); }
    // Esc puts it away
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); console.log('  after Esc:', JSON.stringify(await info(page)));
    await ctx.close();
  }
  if (want('video')) {
    const { ctx, page } = await newPage();
    await open(page, opt('town', `${base}?fixture=range20`));
    await page.waitForFunction(() => { const g = window.__game; return [...g.traffic.lots.values()].filter(l => l.use === 2 && l.level >= 2).length >= 5 && g.lotsPending === 0; }, null, { timeout: 180000, polling: 500 }).catch(() => console.log('  (no shops yet)'));
    await page.evaluate(async () => { window.__lookOf = (await import('/src/game/newart.ts')).lookOf; window.__lib = (await import('/src/game/library.ts')).LIBRARY; });
    if (want('video')) {
      const found = await page.evaluate(() => {
        const g = window.__game, L = window.__lib, lookOf = window.__lookOf, isVideo = id => /^(view:)?(east:)?world:video(_rental)?(:[a-z]+)?$|^variation:world-video(_rental)?-/.test(id);
        for (const [key, l] of g.traffic.lots) { if (l.level < 2) continue; for (const p of g.propsOfLot(key)) { const id = L[lookOf(p).item]?.id ?? ''; if (isVideo(id)) return { key, x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2, id, level: l.level, decline: l.decline, uid: p.uid }; } }
        return null;
      });
      console.log('video store:', JSON.stringify(found));
      if (found) {
        await page.evaluate(([x, y]) => { const g = window.__game; g.setTool('select'); g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [found.x, found.y]);
        await settle(page, 2000);
        const pt = await pointOn(page, new Function(`return p => p.uid === ${found.uid}`)());
        console.log('  its building at', JSON.stringify(pt));
        if (pt.x) { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(400); }
        else await page.evaluate(k => window.__game.openScene({ kind: 'lot', key: k, place: 'video' }), found.key);
        console.log('  after the click:', JSON.stringify(await info(page)));
        // built and not upgraded (hard times), then upgraded and in good repair (the lot's state set on the client's copy, read as the card opens)
        for (const [state, lv] of [['rundown', 2], ['upgraded', 3]]) {
          await page.evaluate(([k, lv]) => { const g = window.__game, l = g.traffic.lots.get(k); l.level = lv; l.decline = 0; g.openScene({ kind: 'lot', key: k, place: 'video' }); }, [found.key, lv]);
          await page.evaluate(() => window.__game.sceneView('outside')); await whole(page, `video-${state}-outside`); console.log('  ', JSON.stringify(await info(page)));
          await page.evaluate(() => window.__game.sceneView('inside')); await card(page, `video-${state}-inside`); console.log('  ', JSON.stringify(await info(page)));
        }
        await page.evaluate(() => window.__game.closeScene());
      }
    }
    await ctx.close();
  }
  if (want('farm')) {
    // a range start's farms (composed near the camera once their parcels are accepted)
    const { ctx, page } = await newPage();
    await open(page, `${base}?start=range&seed=7&stamp=0`);
    await page.waitForFunction(() => window.__game.farmsPending === 0 && window.__game.farmMap.farms.size > 0, null, { timeout: 90000 }).catch(() => console.log('  (no farms yet)'));
    await page.evaluate(async () => { window.__lib = (await import('/src/game/library.ts')).LIBRARY; });
    {
      const farm = await page.evaluate(() => {
        const g = window.__game, L = window.__lib, ids = /^(view:)?(gen:house-farmhouse-wrap|gen:house-l-ranch|gen:house-ranch-long|expansion:ranch-rear)/;
        for (const p of g.props) if (p.auto?.startsWith('farm:') && ids.test(L[p.item]?.id ?? '')) return { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2, uid: p.uid, key: p.auto.slice(5), id: L[p.item].id };
        return { farms: g.farmMap.farms.size, props: [...g.props].filter(p => p.auto?.startsWith('farm:')).length };
      });
      console.log('farm:', JSON.stringify(farm));
      if (farm.uid) {
        await page.evaluate(([x, y]) => { const g = window.__game; g.setTool('select'); g.camEase = null; g.lookAt(x, y, 0.3); g.emit(); }, [farm.x, farm.y]);
        await settle(page, 2000);
        const pt = await pointOn(page, new Function(`return p => p.uid === ${farm.uid}`)());
        if (pt.x) { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(400); } else await page.evaluate(k => window.__game.openScene({ kind: 'farm', key: k }), farm.key);
        console.log('  after the click:', JSON.stringify(await info(page)));
        await whole(page, 'farm');
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

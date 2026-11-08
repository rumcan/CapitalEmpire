// T332 (#958): in-game shots of the clubhouse on a new range start (placed by the game's own ghost, as pros-shots.mjs does) and on a town start
// (the old nine's game-placed clubhouse), with the props the clubhouse draws (business/art.ts) and what each is drawn as logged.
//   node scripts/dev/clubhouse-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T332 --tag before [--seed 7] [--town-seed 2]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written to the server (non-GET requests are answered here).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/clubhouse-shots'), tag = opt('tag', 'shot');
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const W = 1600, H = 1000;

/** the clubhouse's props: the library id each draws, its scale, what it is drawn as, and its drawn rect */
const clubProps = () => {
  const g = window.__game, d = g.bizDefs.find(q => q.type === 'clubhouse'); if (!d) return null;
  const ps = (g.businessProps ?? []).filter(p => Math.floor((-1000000 - p.uid) / 100) === d.id);
  return { def: d, props: ps.map(p => ({ item: p.item, x: p.x, y: p.y, scale: p.scale, flip: p.flip, in: g.sprites?.has?.(p) })) };
};

async function run(url, name, place) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  const shot = async n => { const f = join(out, `${tag}-${name}-${n}.png`); await page.screenshot({ path: f }); console.log('shot', f); };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
    await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.closeWho?.('Pat Owner', 0); g.setTool?.('select'); g.setSpeed(0); g.traffic.spend('business', -2000000); g.emit(); });
    await sleep(1500);
    if (place) {
      // T288's bare start: the driving range first, on its start spot (bare-start-shots.mjs), so a drive leads to the plot
      if (!await page.evaluate(() => window.__game.bizDefs.some(d => d.type === 'range'))) {
        const p = await page.evaluate(([u, v]) => {
          const g = window.__game, [px, py] = g.golf.range.home, f = g.golf.dir, W = 70, D = 150;
          return f === 2 ? { x: px + u, y: py + v } : f === 0 ? { x: px + W - u, y: py + D - v } : f === 1 ? { x: px + v, y: py + W - u } : { x: px + D - v, y: py + u };
        }, [35, 12]);
        await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.08); g.emit(); g.placeRangePart('range'); }, [p.x, p.y]);
        await sleep(800);
        const s = await page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [p.x, p.y]);
        await page.mouse.move(s.x, s.y); await sleep(300); await page.mouse.down(); await page.mouse.up(); await sleep(800);
      }
      const r = await page.evaluate(() => window.__game.bizDefs.find(d => d.type === 'range'));
      console.log('range', JSON.stringify(r));
      const rc = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      await page.evaluate(([x, y]) => { const g = window.__game; g.lookAt(x, y, 0.12); g.emit(); }, [rc.x, rc.y]);
      await sleep(1500);
      await page.evaluate(() => window.__game.placeClubhouse(true));
      const s = await page.evaluate(([near, reach, step]) => {
        const g = window.__game, c = g.screen(near.x, near.y), cx = c.x / g.dpr, cy = c.y / g.dpr, whys = {};
        for (let r = 0; r <= reach; r += step) for (let a = 0; a < Math.max(1, Math.round(2 * Math.PI * r / step)); a++) {
          const t = a / Math.max(1, Math.round(2 * Math.PI * r / step)) * Math.PI * 2, mx = cx + Math.cos(t) * r, my = cy + Math.sin(t) * r;
          if (mx < 380 || my < 120 || mx > innerWidth - 20 || my > innerHeight - 80) continue;
          g.clubUpdate(mx, my); const h = g.bizHover; if (!h) continue;
          if (!h.why) return { mx, my };
          whys[h.why] = (whys[h.why] ?? 0) + 1;
        }
        return { mx: null, whys };
      }, [rc, 600, 16]);
      console.log('clubhouse spot', JSON.stringify(s));
      if (s.mx !== null) await page.evaluate(([x, y]) => { const g = window.__game; g.clubUpdate(x, y); g.clubClick(); }, [s.mx, s.my]);
    }
    const info = await page.evaluate(clubProps);
    console.log(name, 'clubhouse', JSON.stringify(info));
    if (!info) return;
    const ids = await page.evaluate(ps => ps.map(p => window.__game.libraryId?.(p.item) ?? p.item), info.props);
    console.log(name, 'items', JSON.stringify(ids));
    const d = info.def;
    for (const z of [0.12, 0.3]) {
      console.log("cam", JSON.stringify(await page.evaluate(([x, y, z]) => { const g = window.__game; g.stopWatching?.(); g.camEase = null; g.lookAt(x, y, z); g.emit(); return [g.cam.X, g.cam.Y, g.cam.z, !!g.golfWatch, g.tool]; }, [d.x + d.w / 2, d.y + d.h / 2, z])));
      await sleep(2500); await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [d.x + d.w / 2, d.y + d.h / 2, z]); await sleep(1500); console.log("after", JSON.stringify(await page.evaluate(() => { const g = window.__game; return [g.cam.X, g.cam.Y, g.cam.z]; })));
      await shot(`z${z}`);
    }
  } finally { await ctx.close(); }
}

try {
  if (opt('only', 'range') === 'range' || !args.includes('--only')) await run(`${base}?seed=${opt('seed', '7')}`, 'range', true);
  if (opt('only', 'town') === 'town' || !args.includes('--only')) await run(`${base}?start=town&seed=${opt('town-seed', '2')}`, 'town', false);
} finally { await browser.close(); }

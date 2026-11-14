// J12 (#1271): builds the living scene's world, src/assets/showcase/menu.cesave: a jam game played the way a player would, by the game's own flows
// (buy the old range, clear its junk, the Build menu's range upgrades, the clubhouse beside the range's drive, holes through the New hole wizard
// with sod and frame trees), on a pinned map seed, then exported as a save. The numbers (seed, holes, clubhouse spots) are in menu-scene-world.json;
// the stops that look at it are in src/game/showcase.ts. Nothing here is the player's: the file is loaded read-only behind the title card.
//   node scripts/jam/menu-scene-build.mjs --base http://127.0.0.1:5412/ [--spec scripts/jam/menu-scene-world.json] [--out src/assets/showcase/menu.cesave] [--headed]
// Needs a vite dev server on --base started with VITE_JAM=1 (the seed parameter is a dev-server feature). One headless Chrome, closed when done.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, has = k => args.includes(`--${k}`);
const base = opt('base', 'http://127.0.0.1:5412/'), specFile = resolve(opt('spec', 'scripts/jam/menu-scene-world.json')), out = resolve(opt('out', 'src/assets/showcase/menu.cesave'));
const spec = JSON.parse(readFileSync(specFile, 'utf8'));
mkdirSync(dirname(out), { recursive: true });

/** the whole build, run in the page (window.__game is the engine): a log of what each step did */
async function buildInPage(spec) {
  const g = window.__game, log = [];
  g.sandboxUnlock = true; g.setSpeed(0);
  g.traffic.spend('bank', -3000000); // (cash is no object: this is the scene's club, not a game)
  const p = g.paint, w = p.wizard; p.host.planLock = () => null; p.plantKind = 'sod'; // sod: grown in at once, the mown stripes
  // 1) the old range, bought and cleared, with the menu's upgrades (ui/jam/build-menu.ts MENU_UPGRADES and the car park's two steps)
  if (g.golf.range.forSale) log.push(['buyRange', g.buyRange()]);
  let n = 0; while ((g.golf.range.junk || []).length && n++ < 30) g.clearJunk(0);
  for (const id of ['teeturf', 'grass', 'greens', 'targets', 'gravel', 'pave', 'bays8', 'bays12', 'covered', 'dispenser']) log.push([id, g.range.buy(id)]);
  // 2) the clubhouse beside the range's drive (the range's car park is the club's)
  g.placeClubhouse(true);
  let club = null;
  for (const [x, y] of spec.clubTry) { g.clubUpdate(0, 0, { x, y }); const h = g.bizHover; if (h && h.def && !h.why) { club = h.def; g.clubClick(); break; } }
  g.placeClubhouse(false); log.push(['clubhouse', club]);
  // 3) the holes through the New hole wizard: the tee and the green as two clicks, a dogleg as a bend dragged out of the line's '+', then Build (with its trees)
  const tmap = (x, y) => ({ x: x * 10, y: y * 10 });
  const hole = h => {
    g.setTool('course'); if (g.tool !== 'course') return 'no course tool';
    if (!p.setPlan()) return 'no plan'; w.suggestM = 0; // (the first hole's par 3 suggestion is the tutorial's)
    p.pointerDown(h.tee, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'green') { p.cancelPlan(); return 'tee refused'; }
    p.pointerDown(h.green, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'shape') { p.cancelPlan(); return 'green refused'; }
    for (const b of h.bends || []) {
      const pl = w.plan, mid = { x: (pl.tee.x + pl.green.x) / 2, y: (pl.tee.y + pl.green.y) / 2 }, hs = w.handles().filter(q => q.k === 'add'), at = hs.length ? hs[0] : mid;
      if (w.press({ x: at.x, y: at.y }, at.x * 10, at.y * 10, tmap) !== 'drag') return 'bend refused';
      w.dragTo(b); w.release();
    }
    if (h.size) w.sizeGreen(h.size);
    const c = w.check(); if (!c.ok) { const why = c.why; p.cancelPlan(); return 'check: ' + why; }
    const info = { par: c.ghost && c.ghost.info.par, lengthM: c.ghost && c.ghost.info.lengthM };
    const ok = p.buildPlan(); g.setTool('select'); return ok ? info : 'build failed';
  };
  for (const h of spec.holes) log.push(['hole' + h.n, hole(h)]);
  return log;
}

const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
let failed = '';
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?seed=${spec.seed}#play=new`, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  // the old range is offered once the first view is baked
  await page.waitForFunction(() => window.__game.golf?.range?.forSale === true, null, { timeout: 60000 });
  const log = await page.evaluate(buildInPage, spec);
  for (const [k, v] of log) console.log(k.padEnd(10), JSON.stringify(v));
  const bad = log.filter(([k, v]) => v === false || v === null || typeof v === 'string');
  if (bad.length) throw new Error(`a step failed: ${bad.map(([k, v]) => `${k}: ${v}`).join('; ')}`);
  if (spec.grow > 0) { // (optional: the town and the road's traffic a while on, so the county road is not empty)
    await page.evaluate(() => window.__game.setSpeed(20)); await page.waitForTimeout(spec.grow * 1000); await page.evaluate(() => window.__game.setSpeed(0));
  }
  await page.waitForTimeout(1500);
  await page.evaluate(async () => { const g = window.__game; delete g.golf.everyday; await g.save(); });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.evaluate(() => { window.__game.downloadSave(); })]);
  await dl.saveAs(out);
  console.log(`wrote ${out} (${statSync(out).size} bytes)`);
} catch (e) { failed = String(e?.message ?? e); console.error(failed); } finally { await browser.close(); }
process.exit(failed ? 1 : 0);

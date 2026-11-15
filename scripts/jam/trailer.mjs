// The jam trailer (docs/jam/VIDEO.md): an advert of the real game, recorded from the jam build by a robot that plays it with the game's own tools.
//   node scripts/jam/trailer.mjs build  --base http://127.0.0.1:5480/      the showcase club: a VITE_JAM=1 dev server (?seed= is a dev-server feature)
//   node scripts/jam/trailer.mjs record [--base url] [--only a,b]          the shots, from dist-jam (npm run build:jam) served on a scratch port
//   node scripts/jam/trailer.mjs edit                                      the cut: shots + captions + music + end card -> trailer.mp4
// Output under --out (default F:/ClaudeTemp/jam/video): showcase.cesave, raw/<shot>/ (frames and their times), shots/<shot>.mp4, trailer.mp4.
// One headless Chrome at a time (playwright-core, the installed Chrome, WebGL on the GPU), closed when done; the preview server is stopped too.
// What the robot does is what a player can do: it clicks the game's buttons and the map with a real mouse (the pointer is drawn so it shows), presses the
// golf view's keys, and calls the engine only for what a button calls (the button named beside it) or to place the camera. The showcase club's cash is
// topped up (the club is a set, not a game: its takings would take years); the money is never filmed.
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Recorder, cursorScript, FPS } from './trailer-rec.mjs';
import { vclockSource } from './trailer-vclock.mjs';

const args = process.argv.slice(2), phase = args[0] ?? 'help';
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, has = k => args.includes(`--${k}`);
const OUT = resolve(opt('out', 'F:/ClaudeTemp/jam/video')), SAVE = join(OUT, 'showcase.cesave');
const WORLD = JSON.parse(readFileSync(resolve('scripts/jam/trailer-world.json'), 'utf8'));
const W = 1920, H = 1080;
mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

async function launch() {
  const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  return browser;
}
async function newPage(browser, { cursor = true, fresh = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: true });
  if (fresh) await ctx.addInitScript(() => { if (!sessionStorage.getItem('trailer-fresh')) { try { localStorage.clear(); indexedDB.deleteDatabase?.('ce'); } catch { /* none */ } sessionStorage.setItem('trailer-fresh', '1'); } });
  await ctx.addInitScript({ content: vclockSource }); // (the clips' clock: inert until a shot records, trailer-vclock.mjs)
  if (cursor) await ctx.addInitScript(cursorScript);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('[console]', m.text().slice(0, 240)); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  return page;
}
const ready = page => page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });

// ------------------------------------------------------------------ build: the showcase club
/** in the page: the club built by the game's own flows (the menu scene's builder, scripts/jam/menu-scene-build.mjs, with more holes and a real course) */
async function buildClub(spec) {
  const g = window.__game, log = [];
  g.sandboxUnlock = true; g.setSpeed(0);
  g.traffic.spend('bank', -5000000); // (the set's cash: never filmed)
  if (g.golf.range.forSale) log.push(['buyRange', g.buyRange()]);
  let n = 0; while ((g.golf.range.junk || []).length && n++ < 30) g.clearJunk(0);
  for (const id of ['teeturf', 'grass', 'greens', 'targets', 'gravel', 'pave', 'bays8', 'bays12', 'covered', 'dispenser']) log.push([id, g.range.buy(id)]);
  g.placeClubhouse(true); let club = null;
  for (const [x, y] of spec.clubTry) { g.clubUpdate(0, 0, { x, y }); const h = g.bizHover; if (h && h.def && !h.why) { club = h.def; g.clubClick(); break; } }
  g.placeClubhouse(false); log.push(['clubhouse', club ? [club.x, club.y] : null]);
  const p = g.paint, w = p.wizard; p.host.planLock = () => null; p.plantKind = 'sod';
  const tmap = (x, y) => ({ x: x * 10, y: y * 10 });
  const hole = h => { // the New hole wizard: the tee and the green as two clicks, a bend dragged out of the line's '+', then Build (BUILD NOW) with its trees
    g.setTool('course'); if (g.tool !== 'course') return 'no course tool';
    if (!p.setPlan()) return 'no plan'; w.suggestM = 0;
    p.pointerDown(h.tee, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'green') { p.cancelPlan(); return 'tee refused'; }
    p.pointerDown(h.green, -1e6, -1e6); p.pointerUp(0.5); if (w.step !== 'shape') { p.cancelPlan(); return 'green refused'; }
    for (const b of h.bends || []) {
      const pl = w.plan, mid = { x: (pl.tee.x + pl.green.x) / 2, y: (pl.tee.y + pl.green.y) / 2 }, hs = w.handles().filter(q => q.k === 'add'), at = hs.length ? hs[0] : mid;
      if (w.press({ x: at.x, y: at.y }, at.x * 10, at.y * 10, tmap) !== 'drag') return 'bend refused'; w.dragTo(b); w.release();
    }
    const c = w.check(); if (!c.ok) { p.cancelPlan(); g.setTool('select'); return 'check: ' + c.why; }
    const info = { par: c.ghost && c.ghost.info.par, m: c.ghost && c.ghost.info.lengthM };
    const ok = p.buildPlan(); g.setTool('select'); return ok ? info : 'build failed';
  };
  for (const h of spec.holes) log.push(['hole' + h.n, hole(h)]);
  return log;
}
/** in the page: a real course from the list laid where the spec says (Course > Place a real course > it, then a click and Place it: RealPlacer.click/confirm) */
async function layReal(r) {
  const g = window.__game; if (!(await g.startRealPlace(r.id))) return 'not in hand';
  for (let i = 0; i < (r.turns ?? 0); i++) g.real.turn(1);
  g.real.at = { x: r.at[0], y: r.at[1] }; const pl = g.real.plan(true); if (!pl || pl.why) { g.real.cancel(); return 'refused: ' + (pl?.why ?? 'no plan'); }
  g.real.click(); const ok = g.real.confirm(); await new Promise(res => setTimeout(res, 4000)); return ok;
}
/** the cards a new club raises, answered as a player would: who are you (a name, the first look), the tutorial skipped, the range card closed */
async function answerCards(page) {
  const who = page.locator('button', { hasText: "That's me" });
  if (await who.isVisible().catch(() => false)) { await page.locator('input[placeholder="Your name"]').fill('Sam').catch(() => {}); await who.click(); await wait(800); }
  const skip = page.locator('button', { hasText: 'Skip tutorial' }).first();
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await wait(400); }
  await page.evaluate(() => { const g = window.__game; g.openRangeCard(false); g.setTool('select'); });
}
async function build() {
  const base = opt('base', 'http://127.0.0.1:5480/');
  const browser = await launch(); let failed = '';
  try {
    const page = await newPage(browser, { cursor: false });
    await page.goto(`${base}?seed=${WORLD.seed}#play=new`, { waitUntil: 'commit', timeout: 180000 });
    await ready(page); await wait(2500);
    await page.waitForFunction(() => { const r = window.__game.golf?.range; return !!r && (r.forSale === true || (r.owned?.length ?? 0) > 0); }, null, { timeout: 120000 });
    const log = await page.evaluate(buildClub, WORLD);
    for (const r of WORLD.real ?? []) log.push(['real ' + r.id, await page.evaluate(layReal, r)]);
    for (const [k, v] of log) console.log(k.padEnd(12), JSON.stringify(v));
    const bad = log.filter(([, v]) => v === false || v === null || typeof v === 'string');
    if (bad.length) console.log('steps refused:', bad.map(([k, v]) => `${k}: ${v}`).join('; '));
    await wait(1500); await answerCards(page);
    // the town and the club run on at 20x (the town grows its lots along the county road by itself; the jam has no road tool)
    const t0 = Date.now(); await page.evaluate(() => window.__game.setSpeed(20));
    while (Date.now() - t0 < WORLD.grow * 1000) { await wait(15000); await page.evaluate(() => { const g = window.__game; if (g.speed !== 20) g.setSpeed(20); }); }
    // then on to a month with no town event on (an event's leaderboard stays up for months; the Mayor's Cup and the Club Championship are not filmed):
    // until none has shown for a few checks running, in late winter or spring
    for (let k = 0, clear = 0; k < 150 && clear < 4; k++) {
      const s = await page.evaluate(() => ({ m: document.body.innerText.match(/\b([A-Z][a-z]{2}) 19\d\d\b/)?.[1] ?? '', ev: !!document.querySelector('[data-testid="leaderboard"]') || /Mayor's Cup|Tournament prep|Club Championship/i.test(document.body.innerText) }));
      clear = !s.ev && ['Jan', 'Feb', 'Mar', 'Apr', 'May'].includes(s.m) ? clear + 1 : 0;
      await page.evaluate(c => { const g = window.__game; g.setSpeed(c >= 4 ? 0 : 20); }, clear); await wait(2000);
    }
    await page.evaluate(() => window.__game.setSpeed(0));
    console.log('grown:', JSON.stringify(await page.evaluate(() => ({ built: window.__game.traffic.built, pop: window.__game.traffic.pop }))));
    await page.evaluate(async () => { await window.__game.save(); });
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.evaluate(() => { void window.__game.downloadSave(); })]);
    await dl.saveAs(SAVE); console.log(`wrote ${SAVE} (${statSync(SAVE).size} bytes)`);
  } catch (e) { failed = String(e?.message ?? e); console.error(failed); } finally { await browser.close(); }
  process.exit(failed ? 1 : 0);
}

if (phase === 'build') await build();
else if (phase === 'record') await (await import('./trailer-shots.mjs')).record({ OUT, SAVE, WORLD, W, H, opt, has, launch, newPage, ready, answerCards, preview, freePort, Recorder, wait });
else if (phase === 'edit') await (await import('./trailer-edit.mjs')).edit({ OUT, FPS, opt, has });
else { console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(0, 5).join('\n')); }

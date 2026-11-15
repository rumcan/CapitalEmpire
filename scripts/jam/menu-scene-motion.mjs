// The living menu scene in motion (the owner, 2026-11-15: traffic and people walking in the town, then golfers on the course, then the desert range): one headless
// Chrome at 1600 x 900 on a served build (a dev server, with or without VITE_JAM=1, or a preview of dist-jam), two runs:
//   --flow boot   the title card at the page's start (the jam build): the director's lap as it plays, two frames ~4 s apart at each stop (<out>/<tag>-<stop>-a.jpg, -b.jpg),
//                 and the frame time while the scene runs (requestAnimationFrame intervals, and the engine's own frame time)
//   --flow exit   any build: a game played and saved, then the settings menu's Exit to main menu: the page starts again over the scene (two frames of it), the
//                 player's save is read before and after (it must not change), and Continue brings the saved game back (the town's seed is the save's)
//   node scripts/jam/menu-scene-motion.mjs --base http://127.0.0.1:5437/ --flow boot --tag jam --out F:/ClaudeTemp/jam/menu-scene [--stops 6] [--json f.json]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5437/'), flow = opt('flow', 'boot'), tag = opt('tag', flow), out = opt('out', 'output/menu-scene'), nStops = Number(opt('stops', 6));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const res = { base, flow }; let failed = '';
const shot = async (page, name) => { const f = join(out, `${tag}-${name}.jpg`); writeFileSync(f, await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 80 }).toBuffer()); console.log('  shot', f); return f; };
const stat = a => { const s = [...a].sort((x, y) => x - y), n = s.length; if (!n) return null; const mean = s.reduce((x, y) => x + y, 0) / n; return { frames: n, meanMs: +mean.toFixed(2), p95Ms: +s[Math.floor(n * 0.95)].toFixed(2), worstMs: +s[n - 1].toFixed(2), over20: +(s.filter(v => v > 20).length / n).toFixed(3), fps: +(1000 / mean).toFixed(1) }; };
/** the player's save, as stored (IndexedDB capital-empire/saves/town): its size and a checksum */
const savePrint = page => page.evaluate(() => new Promise(res => { const r = indexedDB.open('capital-empire', 1); r.onerror = () => res('no-db'); r.onsuccess = () => { try { const q = r.result.transaction('saves').objectStore('saves').get('town'); q.onerror = () => res('no-read'); q.onsuccess = async () => { const v = q.result; if (v == null) { res('none'); return; } const b = v instanceof Blob ? new Uint8Array(await v.arrayBuffer()) : v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer) : new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v)); let h = 2166136261; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; } res(`${b.length}:${h.toString(16)}`); }; } catch (e) { res('err ' + e); } }; }));
/** the lap as the director plays it: two frames ~4 s apart at each stop, and the frame times between the shots */
async function lap(page, label) {
  await page.waitForFunction(() => window.__showDirector?.phase === 'play', null, { timeout: 240000 });
  res[`${label}FirstLiveMs`] = await page.evaluate(() => Math.round(performance.now()));
  const frames = [], engine = [];
  for (let k = 0; k < nStops; k++) {
    const id = await page.evaluate(() => window.__showDirector.stop.id), i0 = await page.evaluate(() => window.__showDirector.index);
    await page.waitForTimeout(1500); await shot(page, `${label}-${k}-${id}-a`);
    // the frame time between the shots (no screenshot inside the window)
    await page.evaluate(() => { window.__fr = []; let last = 0; window.__frOn = true; const f = t => { if (!window.__frOn) return; if (last) window.__fr.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await page.waitForTimeout(4000);
    const w = await page.evaluate(() => { window.__frOn = false; const g = window.__game; return { fr: window.__fr, eng: g.perf?.frameMs ?? null }; }); frames.push(...w.fr); if (w.eng !== null) engine.push(w.eng);
    await shot(page, `${label}-${k}-${id}-b`);
    if (k < nStops - 1) await page.waitForFunction(i => window.__showDirector.index !== i && window.__showDirector.phase === 'play', i0, { timeout: 60000 });
  }
  res[`${label}Frames`] = stat(frames); res[`${label}EngineFrameMs`] = engine.map(v => +v.toFixed(2));
}
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  if (flow === 'boot') {
    await page.goto(base, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForSelector('[data-testid=title-card]', { timeout: 120000 });
    await page.waitForTimeout(300); await shot(page, 'boot-poster');
    await lap(page, 'boot');
  } else {
    // a game of the player's, saved
    await page.goto(base, { timeout: 120000 });
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); await page.waitForTimeout(2500);
    if (await page.locator('[data-testid=title-continue], [data-testid=title-new]').count()) { await page.locator('[data-testid=title-new]').click(); await page.waitForFunction(() => window.__game?.ready && !window.__game.show, null, { timeout: 240000 }); await page.waitForTimeout(2500); }
    await page.evaluate(() => { const g = window.__game; if (g.startPick && g.startPickAuto) g.startPickAuto(); });
    await page.waitForFunction(() => !window.__game.startPick, null, { timeout: 60000 }); await page.waitForTimeout(2000);
    res.savedBytes = await page.evaluate(async () => await window.__game.save());
    res.seed = await page.evaluate(() => window.__game.seed);
    res.saveBefore = await savePrint(page);
    // Exit to main menu (the settings menu)
    await page.locator('[data-tip="Settings"]').first().click(); await page.locator('[data-testid=menu-exit-title]').click();
    await page.waitForSelector('[data-testid=title-card]', { timeout: 30000 });
    await page.waitForURL(/#menu/, { timeout: 60000 }); res.menuUrl = page.url();
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
    res.sceneWorld = await page.evaluate(() => !!window.__game.show);
    await lap(page, 'exit');
    res.saveAfterScene = await savePrint(page);
    // Continue: the player's own game again
    await page.locator('[data-testid=title-continue]').click();
    await page.waitForFunction(() => window.__game?.ready && !window.__game.show, null, { timeout: 240000 }); await page.waitForTimeout(3000);
    res.afterContinue = await page.evaluate(() => ({ url: location.href, seed: window.__game.seed, show: window.__game.show, card: !!document.querySelector('[data-testid=title-card]') }));
    res.saveAfterContinue = await savePrint(page);
    await shot(page, 'continued');
    if (res.saveAfterScene !== res.saveBefore) failed = `the save changed while the scene ran: ${res.saveBefore} -> ${res.saveAfterScene}`;
    else if (res.afterContinue.seed !== res.seed || res.afterContinue.show || res.afterContinue.card) failed = 'Continue did not bring the saved game back';
  }
} catch (e) { failed = String(e?.message ?? e); }
finally { await browser.close(); }
res.failed = failed || null;
console.log(JSON.stringify(res, null, 1));
if (opt('json', '')) writeFileSync(opt('json', ''), JSON.stringify(res, null, 1));
process.exit(failed ? 1 : 0);

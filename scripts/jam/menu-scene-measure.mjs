// J12 (#1271): what the living scene behind the title card costs. On a served jam build (a preview of dist-jam: npm run build:jam, then
// `npx vite preview --outDir dist-jam --port N`) or the dev server started with VITE_JAM=1, in one headless Chrome (1600 x 900):
//   1. the title card without the scene (#scene=off, the card over the game's own boot): the marks ff-title-card (the card's first render) and ff-game-ready.
//      Before J12 the card stood inside the game-ready block, so the old flow's time to the card is ff-game-ready of this page;
//   2. the title card with the scene: ff-title-card, when Continue shows (a save exists: this script plays a game and saves it first), when the first live
//      picture is up (the director's first view), and the card's click answered;
//   3. the frame time while the scene runs for --secs (default 30): every frame's interval from requestAnimationFrame (mean, 95th, worst, share over 20 ms)
//      and the engine's own frame and draw times.
//   node scripts/jam/menu-scene-measure.mjs --base http://127.0.0.1:4173/ [--secs 30] [--json out.json]
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, has = k => args.includes(`--${k}`);
const base = opt('base', 'http://127.0.0.1:4173/'), secs = Number(opt('secs', 30)), W = Number(opt('w', 1600)), H = Number(opt('h', 900));
const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const out = {}; let failed = '';
const marks = page => page.evaluate(() => ({ ...Object.fromEntries(['ff-title-card', 'ff-game-ready'].map(n => [n, Math.round(performance.getEntriesByName(n)[0]?.startTime ?? -1)])), fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1) }));
const stat = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return { frames: n, meanMs: +(s.reduce((x, y) => x + y, 0) / n).toFixed(2), p95Ms: +s[Math.floor(n * 0.95)].toFixed(2), worstMs: +s[n - 1].toFixed(2), over20: +(s.filter(v => v > 20).length / n).toFixed(3), fps: +(1000 / (s.reduce((x, y) => x + y, 0) / n)).toFixed(1) }; };
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // a game with a save first, so Continue exists (this page is the game's own boot: #play=new)
  const g0 = await ctx.newPage(); await g0.goto(`${base}#play=new`);
  await g0.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); await g0.waitForTimeout(2500);
  await g0.evaluate(async () => { await window.__game.save(); }); await g0.close();

  /** one load of the page without the scene (#scene=off: the card over the game's own boot) */
  const without = async () => {
    const p = await ctx.newPage(); const t = Date.now(); await p.goto(`${base}#scene=off`, { waitUntil: 'commit' });
    await p.waitForSelector('[data-testid=title-card]', { timeout: 120000 }); const card = Date.now() - t;
    await p.waitForSelector('[data-testid=title-continue]', { timeout: 120000 }); const cont = Date.now() - t;
    await p.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); const m = await marks(p);
    await p.close(); return { cardMark: m['ff-title-card'], fcp: m.fcp, continueWall: cont, cardWall: card, gameReadyMark: m['ff-game-ready'] };
  };
  /** one load of the page with the scene; sample: also the frame times over `secs` seconds and the click on New game */
  const withScene = async sample => {
    const p = await ctx.newPage(); await p.addInitScript(() => { window.__frames = []; let last = 0; const f = t => { if (last) window.__frames.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const t = Date.now(); await p.goto(base, { waitUntil: 'commit' });
    await p.waitForSelector('[data-testid=title-card]', { timeout: 120000 }); const card = Date.now() - t;
    await p.waitForSelector('[data-testid=title-continue]', { timeout: 120000 }); const cont = Date.now() - t;
    const stillShown = await p.waitForFunction(() => { const i = document.querySelector('[data-testid=menu-still]'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 120000 }).then(() => Date.now() - t, () => -1);
    await p.waitForFunction(() => window.__showDirector?.phase === 'play', null, { timeout: 240000 }); const live = Date.now() - t; const m = await marks(p);
    const r = { cardMark: m['ff-title-card'], fcp: m.fcp, continueWall: cont, cardWall: card, stillShownWall: stillShown, firstLivePictureWall: live, gameReadyMark: m['ff-game-ready'] };
    r.cardClickable = await p.evaluate(() => { const b = document.querySelector('[data-testid=title-how]'); if (!b) return false; const q = b.getBoundingClientRect(), e = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return !!e && (e === b || b.contains(e)); });
    if (sample) {
      await p.evaluate(() => { window.__frames.length = 0; });
      const samples = [];
      for (let i = 0; i < secs; i++) { await p.waitForTimeout(1000); samples.push(await p.evaluate(() => { const g = window.__game; return { ms: g.perf.frameMs, cpu: g.perf.cpuMs, draw: g.perf.drawMs, idx: window.__showDirector.index }; })); }
      const frames = await p.evaluate(() => window.__frames.slice());
      r.sceneFrames = { ...stat(frames), engineFrameMsMean: +(samples.reduce((a, q) => a + q.ms, 0) / samples.length).toFixed(2), engineCpuMsMean: +(samples.reduce((a, q) => a + q.cpu, 0) / samples.length).toFixed(2), engineDrawMsMean: +(samples.reduce((a, q) => a + q.draw, 0) / samples.length).toFixed(2), stopsSeen: new Set(samples.map(q => q.idx)).size, seconds: secs };
      // a choice leaves the scene: the page reloads into the game's own boot (how long to a playable game)
      const t3 = Date.now(); await p.click('[data-testid=title-new]');
      await p.waitForFunction(() => location.hash === '' && window.__game?.ready && !window.__game.show && !document.querySelector('[data-testid=title-card]'), null, { timeout: 240000 }); r.newGameToPlayableMs = Date.now() - t3;
    }
    await p.close(); return r;
  };

  const runs = Number(opt('runs', 3)), W0 = [], W1 = [];
  for (let k = 0; k < runs; k++) { W0.push(await without()); W1.push(await withScene(k === 0)); } // (alternating: neither always gets the warmer cache)
  const med = (rs, k) => median(rs.map(r => r[k]).filter(v => v >= 0));
  out.runs = runs;
  out.withoutScene = { firstContentfulPaintMs: med(W0, 'fcp'), cardRenderedMs: med(W0, 'cardMark'), continueShownMs: med(W0, 'continueWall'), gameReadyMs: med(W0, 'gameReadyMark'), note: 'before J12 the card was drawn only when the game was ready: its time to the card is gameReadyMs' };
  out.withScene = { firstContentfulPaintMs: med(W1, 'fcp'), cardRenderedMs: med(W1, 'cardMark'), continueShownMs: med(W1, 'continueWall'), stillShownMs: med(W1, 'stillShownWall'), firstLivePictureMs: med(W1, 'firstLivePictureWall'), gameReadyMs: med(W1, 'gameReadyMark'), cardClickable: W1.every(r => r.cardClickable) };
  out.sceneFrames = W1[0].sceneFrames; out.newGameToPlayableMs = W1[0].newGameToPlayableMs;
  out.all = { without: W0, withScene: W1.map(r => ({ ...r, sceneFrames: undefined })) };
  console.log(JSON.stringify(out, null, 1));
  if (opt('json', '')) writeFileSync(opt('json', ''), JSON.stringify(out, null, 1));
} catch (e) { failed = String(e?.message ?? e); console.error(failed); console.log(JSON.stringify(out, null, 1)); } finally { await browser.close(); }
process.exit(failed ? 1 : 0);

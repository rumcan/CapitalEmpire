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
const marks = page => page.evaluate(() => Object.fromEntries(['ff-title-card', 'ff-game-ready'].map(n => [n, Math.round(performance.getEntriesByName(n)[0]?.startTime ?? -1)])));
const stat = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return { frames: n, meanMs: +(s.reduce((x, y) => x + y, 0) / n).toFixed(2), p95Ms: +s[Math.floor(n * 0.95)].toFixed(2), worstMs: +s[n - 1].toFixed(2), over20: +(s.filter(v => v > 20).length / n).toFixed(3), fps: +(1000 / (s.reduce((x, y) => x + y, 0) / n)).toFixed(1) }; };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // a game with a save first, so Continue exists (this page is the game's own boot: #play=new)
  const g0 = await ctx.newPage(); await g0.goto(`${base}#play=new`);
  await g0.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); await g0.waitForTimeout(2500);
  await g0.evaluate(async () => { await window.__game.save(); }); await g0.close();

  // 1. without the scene
  const p1 = await ctx.newPage(); const t1 = Date.now(); await p1.goto(`${base}#scene=off`, { waitUntil: 'commit' });
  await p1.waitForSelector('[data-testid=title-card]', { timeout: 120000 }); const card1 = Date.now() - t1;
  await p1.waitForSelector('[data-testid=title-continue]', { timeout: 120000 }); const cont1 = Date.now() - t1;
  await p1.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); const ready1 = Date.now() - t1; const m1 = await marks(p1);
  out.withoutScene = { cardShownMs: m1['ff-title-card'], continueShownMs: cont1 - 0, gameReadyMs: m1['ff-game-ready'], wall: { card: card1, continue: cont1, ready: ready1 }, note: 'the old flow showed the card at gameReady' };
  await p1.close();

  // 2 and 3. with the scene
  const p2 = await ctx.newPage(); await p2.addInitScript(() => { window.__frames = []; let last = 0; const f = t => { if (last) window.__frames.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const t2 = Date.now(); await p2.goto(base, { waitUntil: 'commit' });
  await p2.waitForSelector('[data-testid=title-card]', { timeout: 120000 }); const card2 = Date.now() - t2;
  await p2.waitForSelector('[data-testid=title-continue]', { timeout: 120000 }); const cont2 = Date.now() - t2;
  await p2.waitForFunction(() => window.__showDirector?.phase === 'play', null, { timeout: 240000 }); const live2 = Date.now() - t2; const m2 = await marks(p2);
  out.withScene = { cardShownMs: m2['ff-title-card'], continueShownMs: cont2, firstLivePictureMs: live2, gameReadyMs: m2['ff-game-ready'], wall: { card: card2, continue: cont2, live: live2 } };
  // the card answers a click at once: the button is under the pointer and enabled
  out.withScene.cardClickable = await p2.evaluate(() => { const b = document.querySelector('[data-testid=title-how]'); if (!b) return false; const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && (e === b || b.contains(e)); });
  await p2.evaluate(() => { window.__frames.length = 0; });
  const samples = [];
  for (let i = 0; i < secs; i++) { await p2.waitForTimeout(1000); samples.push(await p2.evaluate(() => { const g = window.__game; return { ms: g.perf.frameMs, cpu: g.perf.cpuMs, draw: g.perf.drawMs, idx: window.__showDirector.index, phase: window.__showDirector.phase }; })); }
  const frames = await p2.evaluate(() => window.__frames.slice());
  out.sceneFrames = { ...stat(frames), engineFrameMsMean: +(samples.reduce((a, s) => a + s.ms, 0) / samples.length).toFixed(2), engineCpuMsMean: +(samples.reduce((a, s) => a + s.cpu, 0) / samples.length).toFixed(2), engineDrawMsMean: +(samples.reduce((a, s) => a + s.draw, 0) / samples.length).toFixed(2), stopsSeen: [...new Set(samples.map(s => s.idx))].length, seconds: secs };
  // a choice leaves the scene: the page reloads into the game's own boot (how long to the game)
  const t3 = Date.now(); await p2.click('[data-testid=title-new]'); await p2.waitForFunction(() => location.hash === '' && window.__game?.ready && !document.querySelector('[data-testid=title-card]'), null, { timeout: 240000 }); out.newGameToPlayableMs = Date.now() - t3;
  await p2.close();
  console.log(JSON.stringify(out, null, 1));
  if (opt('json', '')) writeFileSync(opt('json', ''), JSON.stringify(out, null, 1));
} catch (e) { failed = String(e?.message ?? e); console.error(failed); console.log(JSON.stringify(out, null, 1)); } finally { await browser.close(); }
process.exit(failed ? 1 : 0);

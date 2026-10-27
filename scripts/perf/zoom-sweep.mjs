// Zoom sweeps in the real game (T197, the owner: "zooming in and out glitches the textures alot"): a seeded new game (?start=town), on the
// course, the town and the open map, the wheel zoomed out from the closest zoom to about 2% and back, at a normal pace (a tick every 110 ms)
// and fast (30 ms). Every frame is classified from the engine's own state (the ground chunks on screen at the street and district tiers: the
// planner map under a chunk with no picture and no other tier's picture to show (a blurry patch), the other tier's pictures, an older picture
// (another level or tile band) while its new one bakes; the band and tier switches; frames over 34 ms) and the frames are recorded (CDP
// screencast) for strips. Needs a dev server (engine fields read through window.__game).
//   node scripts/perf/zoom-sweep.mjs <tag> [base = http://[::1]:5174/] [scenes = course,town,open]
// Writes output/zoom-sweep/<tag>/{scene}-{speed}.json (a row a frame) and its frames, and summary.json; prints the summary.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const tag = process.argv[2] || 'sweep', base = process.argv[3] || 'http://[::1]:5174/', out = `output/zoom-sweep/${tag}`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.addInitScript(() => { let s = 12345; Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); });
await page.goto(base + '?start=town&grow=1');
const t0 = Date.now();
for (;;) { const r = await page.evaluate(() => ({ ready: !!window.__game?.ready, p: window.__game?.lotsPending ?? -1 })).catch(() => null); if (r?.ready && r.p === 0) break; if (Date.now() - t0 > 120000) break; await new Promise(r => setTimeout(r, 500)); }
// the per-frame recorder
await page.evaluate(() => {
  const CW = { g: 2000, m: 8000 }, CH = { g: 1000, m: 4000 };
  window.__rec = []; window.__recOn = false;
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    if (window.__recOn) {
      const g = window.__game, cam = g.cam, ze = cam.z * g.dpr, tg = g.groundTarget ?? '';
      const m = /^([gm])@([\d.]+):([\d.]+)#(\d+)/.exec(tg);
      const row = { t: Math.round(now), dt: +(now - last).toFixed(1), z: +cam.z.toFixed(4), target: tg, plan: 0, fb: 0, old: 0, ok: 0, n: 0, blend: 0, cut: !!g.groundCut, soft: +(g.perf.atlasSoft ?? 0).toFixed(3), pend: g.ground.busy };
      if (m && cam.z >= 0.0185) {
        const kind = m[1], L = +m[2], artL = +m[3], ts = +m[4], w = CW[kind], h = CH[kind];
        const X0 = cam.X - g.cw / 2 / ze, Y0 = cam.Y - g.ch / 2 / ze, X1 = cam.X + g.cw / 2 / ze, Y1 = cam.Y + g.ch / 2 / ze;
        for (let j = Math.floor(Y0 / h); j <= Math.floor(Y1 / h); j++) for (let i = Math.floor(X0 / w); i <= Math.floor(X1 / w); i++) {
          const t = g.ground.tile(kind, i, j); row.n++;
          if (!t.tex && !t.prev) { const fbk = g.ground.zoomFallback(kind, [i * w, j * h, (i + 1) * w, (j + 1) * h], now); if (fbk.length) row.fb++; else row.plan++; }
          else if (!(t.tex && t.texL === L && t.texArtL === artL && (!t.texTiled || t.texTs === ts))) row.old++;
          else row.ok++;
        }
        row.blend = Number.isFinite(g.groundBlendAt) ? +Math.min(1, Math.max(0, (now - g.groundBlendAt) / 180)).toFixed(2) : 0;
      }
      window.__rec.push(row);
    }
    last = now; requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const cdp = await page.context().newCDPSession(page);
let frames = [], recording = false;
cdp.on('Page.screencastFrame', async f => { if (recording) frames.push({ t: f.metadata.timestamp, data: f.data }); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* closed */ } });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 800, maxHeight: 450, everyNthFrame: 1 });
const at = (x, y) => ({ X: (x - y) * 64, Y: (x + y) * 32 });
const spots = await page.evaluate(() => { const g = window.__game, p = g.golf?.pins?.[0], c = g.townPts?.[0]; return { course: p ? { x: p.x, y: p.y } : null, town: c ? { x: c.x, y: c.y } : null, open: { x: 1500, y: 1500 } }; });
console.log('[spots]', JSON.stringify(spots));
const summary = {};
const only = (process.argv[4] || '').split(',').filter(Boolean);
for (const [scene, p] of Object.entries(spots)) {
  if (!p || (only.length && !only.includes(scene))) continue;
  for (const [speed, ms] of [['normal', 110], ['fast', 30]]) {
    // start at the closest zoom, settled
    await page.evaluate(([X, Y]) => { const g = window.__game; g.cam.X = X; g.cam.Y = Y; g.cam.z = 0.3; }, [at(p.x, p.y).X, at(p.x, p.y).Y]);
    const s0 = Date.now(); await new Promise(r => setTimeout(r, 2500));
    for (;;) { const b = await page.evaluate(() => window.__game.ground.busy); if (b === 0 || Date.now() - s0 > 20000) break; await new Promise(r => setTimeout(r, 300)); }
    await new Promise(r => setTimeout(r, 1000));
    frames = []; recording = true;
    await page.evaluate(() => { window.__rec = []; window.__recOn = true; });
    await page.mouse.move(800, 450);
    for (let k = 0; k < 20; k++) { await page.mouse.wheel(0, 100); await new Promise(r => setTimeout(r, ms)); }   // out to about 2%
    await new Promise(r => setTimeout(r, 600));
    for (let k = 0; k < 20; k++) { await page.mouse.wheel(0, -100); await new Promise(r => setTimeout(r, ms)); }  // back in
    await new Promise(r => setTimeout(r, 1500));
    const rec = await page.evaluate(() => { window.__recOn = false; return window.__rec; });
    recording = false;
    const dir = `${out}/${scene}-${speed}`; fs.mkdirSync(dir, { recursive: true });
    frames.forEach((f, k) => fs.writeFileSync(`${dir}/f${String(k).padStart(4, '0')}.jpg`, Buffer.from(f.data, 'base64')));
    fs.writeFileSync(`${dir}.json`, JSON.stringify(rec));
    // the street and district tiers only (z >= PLANNER_Z, 0.035): below it the planner map is the look by design
    const v = rec.filter(x => x.z >= 0.035);
    summary[`${scene}-${speed}`] = { frames: rec.length, inTiers: v.length, planF: v.filter(x => x.plan > 0).length, planChunkFrames: v.reduce((a, x) => a + x.plan, 0), maxPlan: Math.max(0, ...v.map(x => x.plan)),
      fbF: v.filter(x => x.fb > 0).length, oldF: v.filter(x => x.old > 0).length, bandSwitches: v.filter((x, k) => k > 0 && x.target !== v[k - 1].target).length,
      plannerSwitches: rec.filter((x, k) => k > 0 && (x.z >= 0.035) !== (rec[k - 1].z >= 0.035)).length, longF: rec.filter(x => x.dt > 34).length };
    console.log(scene, speed, JSON.stringify(summary[`${scene}-${speed}`]));
  }
}
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
await browser.close();

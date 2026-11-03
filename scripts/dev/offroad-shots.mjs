// T321 (#912): the range's cars with the main road deleted. On the range start (seed 1), broad day: the county road is bulldozed for ROAD_CUT
// tiles either side of the range's drive turn (J), the sim runs until cars come and go, and the shots show where they drive; the trace (JSON)
// gives every car route's points and how much of it is off the car roads (more than 3 tiles from one).
//   node scripts/dev/offroad-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T321 --tag before
// Needs a dev server (vite) on --base. One headless Edge, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/offroad-shots'), tag = opt('tag', 'after'), seed = opt('seed', '1');
const cut = Number(opt('cut', '70'));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${tag}-${name}.jpg`), png = await page.screenshot({ type: 'png' });
  await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  console.log(file);
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [x, y, z]);
/** the routes of the range's cars now: their points and the share of their length more than 3 tiles from a car road */
const trace = page => page.evaluate(() => {
  const g = window.__game, net = g.net, sim = g.range.sim;
  const off = p => { let d = Infinity; for (const s of net.segsNear(p, 6)) { if (s.cls.noCars) continue; const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2)); d = Math.min(d, Math.hypot(p.x - s.a.x - dx * t, p.y - s.a.y - dy * t)); } return d > 3; };
  const rs = [];
  for (const v of sim.visits) {
    if (!v.r || (v.stage !== 0 && v.stage !== 10)) continue;
    const pts = v.r.pts; let L = 0, offL = 0;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(l)); for (let k = 0; k < n; k++) { const p = { x: a.x + (b.x - a.x) * (k + 0.5) / n, y: a.y + (b.y - a.y) * (k + 0.5) / n }; L += l / n; if (off(p)) offL += l / n; } }
    rs.push({ id: v.id, out: v.stage === 10, len: Math.round(L), offRoad: Math.round(offL), pts: pts.map(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]) });
  }
  return rs;
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`${base}?start=range&seed=${seed}`, { timeout: 240000, waitUntil: "commit" });
  await page.waitForFunction(() => window.__game?.ready && window.__game.range?.scene, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  const sp = await page.evaluate(() => { const sc = window.__game.range.scene; return { J: sc.J, d: sc.roadDir, n: sc.rangeSide, counter: sc.counter }; });
  console.log('start', JSON.stringify(sp));
  // the county road bulldozed for `cut` tiles either side of J (the main road to the range), the drive kept
  const removed = await page.evaluate(([J, d, cut]) => {
    const g = window.__game; let n = 0;
    for (let k = -cut; k <= cut; k += 2) {
      const p = { x: J.x + d.x * k, y: J.y + d.y * k }, pc = g.net.pieceNear(p);
      if (pc && !pc.seg.cls.noCars && Math.abs((pc.seg.b.x - pc.seg.a.x) * d.y - (pc.seg.b.y - pc.seg.a.y) * d.x) > 0.5 * Math.hypot(pc.seg.b.x - pc.seg.a.x, pc.seg.b.y - pc.seg.a.y)) continue; // (not the drive: across the road)
      if (pc && !pc.seg.cls.noCars) { g.edit.removePiece(pc); n++; }
    }
    g.commitNetwork(); return n;
  }, [sp.J, sp.d, cut]);
  console.log('removed pieces', removed);
  await page.evaluate(() => { window.__game.range.sync(true); window.__game.setSpeed(3); });
  await page.waitForFunction(() => window.__game.range.sim.visits.filter(v => v.stage === 0 || v.stage === 10).length >= 3, null, { timeout: 120000, polling: 250 }).catch(() => console.log('  (no cars on the move)'));
  await page.evaluate(() => window.__game.setSpeed(1));
  const rs = await trace(page);
  writeFileSync(join(out, `${tag}-trace.json`), JSON.stringify({ J: sp.J, routes: rs }, null, 1));
  console.log('routes', rs.map(r => `${r.out ? 'out' : 'in'} ${r.offRoad}/${r.len}`).join(', '));
  await look(page, sp.J.x + sp.n.x * 10, sp.J.y + sp.n.y * 10, 0.15); await settle(page, 600); await shot(page, 'range-15pct');
  await look(page, sp.J.x, sp.J.y, 0.3); await settle(page, 600); await shot(page, 'drive-30pct');
} finally { await browser.close(); }

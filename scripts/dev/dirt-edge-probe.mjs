// T247 debug: what lies across the fresh range's desert outfield edge (?start=range&seed=7): at each side's middle, the ground patches and
// course surfaces either side at a few depths, and the roads near
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://127.0.0.1:5186/', seed = process.argv[3] ?? '7';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } }), page = await ctx.newPage();
  await page.goto(`${base}?start=range&seed=${seed}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); await page.waitForTimeout(8000);
  const out = await page.evaluate(() => {
    const g = window.__game, sc = g.range.scene, d = sc.patches.find(p => p.surf === 'desert'); if (!d) return null;
    const inPoly = (p, x, y) => { let c = false; for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) { const yi = p[2 * i + 1], yj = p[2 * j + 1]; if ((yi > y) !== (yj > y) && x < ((p[2 * j] - p[2 * i]) * (y - yi)) / (yj - yi) + p[2 * i]) c = !c; } return c; };
    const all = []; for (const [k, ps] of g.ground.lotPatches) for (const p of ps) all.push({ ...p, key: k });
    const pts = d.pts, n = pts.length / 2, area = (() => { let a = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; } return a / 2; })(), side = area >= 0 ? 1 : -1;
    const at = (x, y) => {
      const hits = all.filter(p => !p.course && inPoly(p.pts, x, y)).map(p => `${p.key}|${p.tex}|${p.paint ? 'z' + p.paint.z : p.lawn ? 'lawn' : 'lot'}`);
      const cs = []; for (const p of all) if (p.course) { const c = p.course; for (const l of c.layers) { for (const r of l.fill) if (inPoly(r, x, y)) cs.push(`${p.key}:s${l.s}`); if (l.collar) for (const r of l.collar.fill) if (inPoly(r, x, y)) cs.push(`${p.key}:c${l.s}`); } }
      const roads = [...g.net.segsNear({ x, y }, 6)].map(s => { const ax = s.a.x, ay = s.a.y, dx = s.b.x - ax, dy = s.b.y - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0; return `${s.kind}:${Math.hypot(ax + dx * t - x, ay + dy * t - y).toFixed(1)}<=${(s.cls.h + s.cls.walk + 0.25).toFixed(1)}`; });
      return { hits, cs, roads };
    };
    const res = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, mx = (pts[2 * i] + pts[2 * j]) / 2, my = (pts[2 * i + 1] + pts[2 * j + 1]) / 2, dx = pts[2 * j] - pts[2 * i], dy = pts[2 * j + 1] - pts[2 * i + 1], l = Math.hypot(dx, dy), nx = side * dy / l, ny = -side * dx / l;
      const probes = {}; for (const dd of [0.4, 1.4, 2.8]) for (const s of [1, -1]) probes[`${s > 0 ? 'out' : 'in'}${dd}`] = at(mx + s * nx * dd, my + s * ny * dd);
      res.push({ side: i, mid: [mx, my], probes });
    }
    return { pts, res };
  });
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
} finally { await browser.close(); }

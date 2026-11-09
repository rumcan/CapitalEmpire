// T362 (#1017): the ground of a map-data course before and after the band of rough (the owner, 2026-11-08: "add a layer of rough around the edges of the fairway and
// greens for the imported course but leave the rest of the course the natural fescue or desert"). A headless Edge on the dev server loads each course three ways:
// `before` (?rough=old: T340's look, the whole boundary rough), `after` (an autumn game: the band of rough round the fairways, greens and tees, natural fescue
// beyond it) and `desert` (?desert=on: the same band, the land's own desert ground beyond it), and shoots the same views of each: a hole at 15% zoom (the ticket's),
// another hole at 15%, the closest zoom (30%) on the green with the most bunker round it, and the whole land. Side-by-side pictures of the variants are written too, and
// the surface counts of each game's grid are printed (numbers for the PR). Exits 1 on a failed check.
//   node scripts/dev/osm-rough-shots.mjs --base http://localhost:5201/ --out E:/ClaudeTemp/T362 [--course woodhill,rondebosch] [--desert 1] [--zoom 0.15] [--holes 1,10]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saving is off (?osmcourse= is a fixture-style start).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5201/'), out = opt('out', 'E:/ClaudeTemp/T362'), which = opt('course', 'woodhill,rondebosch'), withDesert = opt('desert', '1') === '1';
const zoom = Number(opt('zoom', '0.15')), holes = opt('holes', '1,10').split(',').map(Number);
const W = 1440, H = 900;
mkdirSync(out, { recursive: true });
const VARIANTS = [{ key: 'before', q: '&rough=old', label: 'before (T340: the whole boundary rough)' }, { key: 'after', q: '', label: 'after (rough band, natural fescue)' }, ...(withDesert ? [{ key: 'desert', q: '&desert=on', label: 'desert game (rough band, the land\'s own desert ground)' }] : [])];
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const NAMES = ['none', 'rough', 'fescue', 'water', 'fairway', 'tee', 'bunker', 'waste', 'green', 'longGrass'];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 30; }, null, { timeout: 180000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
const shot = async (page, name) => { const f = join(out, `${name}.png`); await page.screenshot({ path: f }); console.log('  ' + f); return f; };
/** the camera on a tile point at a zoom */
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);
/** the camera on the tile points, at the closest zoom that keeps them all on the screen (a margin round them) */
const frameOn = (page, pts, maxZ = 0.3) => page.evaluate(([pts, maxZ, W, H]) => {
  const g = window.__game, cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const fits = z => { g.camEase = null; g.lookAt(cx, cy, z); return pts.every(p => { const s = g.screen(p.x, p.y), x = s.x / g.dpr, y = s.y / g.dpr; return x > 50 && x < W - 50 && y > 80 && y < H - 50; }); };
  let lo = 0.004, hi = maxZ; if (fits(hi)) { g.emit(); return hi; }
  for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  fits(lo); g.emit(); return lo;
}, [pts, maxZ, W, H]);
/** side by side, the variants of a view, left to right, each captioned */
async function sideBySide(files, labels, name) {
  const h = 760, tiles = await Promise.all(files.map(async (f, i) => {
    const img = await sharp(f).resize({ height: h }).toBuffer(), m = await sharp(img).metadata();
    const cap = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="34"><rect width="100%" height="100%" fill="#0b1220"/><text x="10" y="23" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="#e5e7eb">${labels[i].replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
    return { img, w: m.width, cap };
  }));
  const total = tiles.reduce((s, t) => s + t.w, 0) + 12 * (tiles.length - 1);
  let left = 0; const comp = [];
  for (const t of tiles) { comp.push({ input: t.cap, left, top: 0 }, { input: t.img, left, top: 34 }); left += t.w + 12; }
  const f = join(out, `${name}.png`);
  await sharp({ create: { width: total, height: h + 34, channels: 3, background: '#0b1220' } }).composite(comp).png().toFile(f);
  console.log('  ' + f);
}

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const id of which.split(',')) {
    console.log(`\n== ${id}`);
    const files = {}; // view -> { variant -> file }
    const numbers = {};
    for (const v of VARIANTS) {
      console.log(`-- ${v.key}`);
      const page = await ctx.newPage();
      page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
      page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
      await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
      await page.goto(`${base}?osmcourse=${id}${v.q}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 600000 });
      await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
      const info = await page.evaluate(() => {
        const g = window.__game, grid = g.courseGrid, cnt = a => { const o = {}; for (const x of a) o[x] = (o[x] ?? 0) + 1; return o; };
        return { osm: g.golf.osm?.id, course: g.golf.course, surf: cnt(grid.surf), pins: g.golf.pins.length, desert: g.desertTheme };
      });
      const named = Object.fromEntries(Object.entries(info.surf).map(([k, n]) => [NAMES[k], n]));
      numbers[v.key] = named;
      console.log('  grid', JSON.stringify(named), 'desert', info.desert);
      check(info.osm === id && info.pins === 18, `${v.key}: the game is on ${id} with its 18 pins`);
      if (v.key === 'before') check(!named.fescue, 'before: no fescue (T340: the whole boundary is rough)');
      if (v.key === 'after') check((named.fescue ?? 0) > 20000, `after: ${named.fescue} cells of fescue`);
      if (v.key === 'desert') check(!named.fescue && info.desert, 'desert: no fescue painted, and the game is a desert game');
      await page.waitForFunction(() => !window.__game.areasPending, null, { timeout: 120000, polling: 250 }).catch(() => console.log('  (areas still pending)'));
      const add = (view, f) => { (files[view] ??= {})[v.key] = f; };
      // the holes at the ticket's zoom
      for (const n of holes) {
        const mid = await page.evaluate(n => { const G = window.__game.golf, t = G.tees.find(q => q.hole === n && q.kind === 'middle') ?? G.tees.find(q => q.hole === n), p = G.pins.find(q => q.hole === n); return t && p ? { x: (t.x + p.x) / 2, y: (t.y + p.y) / 2 } : null; }, n);
        if (!mid) continue;
        await look(page, mid.x, mid.y, zoom); await settle(page, 1200);
        add(`hole${n}-${Math.round(zoom * 100)}`, await shot(page, `${id}-${v.key}-hole${n}-${Math.round(zoom * 100)}`));
      }
      // the closest zoom, on the green with the most bunker round it
      const gb = await page.evaluate(() => {
        const g = window.__game, grid = g.courseGrid; let best = null;
        for (const p of g.golf.pins) {
          let n = 0; const cx = Math.floor((p.x - grid.x0) / 0.5), cy = Math.floor((p.y - grid.y0) / 0.5);
          for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < grid.w && y < grid.h && grid.surf[y * grid.w + x] === 6) n++; }
          if (!best || n > best.n) best = { hole: p.hole, x: p.x, y: p.y, n };
        }
        return best;
      });
      await look(page, gb.x, gb.y, 0.3); await settle(page, 1500);
      add(`green${gb.hole}-30`, await shot(page, `${id}-${v.key}-green${gb.hole}-30`));
      // the whole land
      const land = info.course, corners = [{ x: land[0], y: land[1] }, { x: land[0] + land[2], y: land[1] }, { x: land[0], y: land[1] + land[3] }, { x: land[0] + land[2], y: land[1] + land[3] }];
      const zOver = await frameOn(page, corners, 0.3); console.log('  overview zoom', zOver.toFixed(4)); await settle(page, 1800);
      add('overview', await shot(page, `${id}-${v.key}-overview`));
      await page.close();
    }
    console.log('numbers', JSON.stringify(numbers));
    for (const [view, byVariant] of Object.entries(files)) {
      const keys = VARIANTS.map(v => v.key).filter(k => byVariant[k]);
      if (keys.length > 1) await sideBySide(keys.map(k => byVariant[k]), keys.map(k => VARIANTS.find(v => v.key === k).label), `${id}-${view}-compare`);
    }
  }
} finally { await browser.close(); }
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed');
process.exit(bad ? 1 : 0);

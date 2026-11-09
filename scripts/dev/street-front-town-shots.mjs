// T375 / T376: the owner's desert town (the grown town of ?fixture=range20, in the desert theme: ?desert=on), the street fronts of its Video Vault, fishing/tackle
// shop, grocery, arcade and a few houses at the game's closest camera (30%): each building's lot found in the town, the camera on it, one shot a building
// and a sheet of them all. Each shot prints the picture the lot draws (the library id, the view it is on) so before and after read side by side.
//   node scripts/dev/street-front-town-shots.mjs --base http://127.0.0.1:5189/ --out E:/ClaudeTemp/T375 --tag before|after [--n 3] [--wanted world:video_rental,town:fish_tackle,...]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Nothing is saved.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5189/'), out = opt('out', 'output/street-front-town'), tag = opt('tag', 'after'), per = +opt('n', '2');
const wanted = opt('wanted', 'world:video_rental,town:fish_tackle,town:grocery,world:arcade,house').split(',');
mkdirSync(out, { recursive: true });
const W = 1100, H = 760, ZOOM = 0.3;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { tag, shots: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?fixture=range20&desert=on`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.setSpeed(0); });
  await page.waitForFunction(() => window.__game.lotsPending === 0, null, { timeout: 120000 }).catch(() => {});
  // every lot's main building, from the props the town laid
  const lots = await page.evaluate(async () => {
    const g = window.__game, { LIBRARY } = await import('/src/game/library.ts'), pa = await import('/src/game/lots/preset-art.ts'), { isBuilding } = await import('/src/game/mirror.ts');
    const out = [];
    for (const [key, props] of g.lotProps) {
      let main = null, area = 0;
      for (const p of props) { const it = LIBRARY[p.item]; if (!isBuilding(it)) continue; const a = (p.x1 - p.x0) * (p.y1 - p.y0); if (a > area) { area = a; main = p; } }
      if (!main) continue;
      const id = LIBRARY[main.item].id, ax = pa.axisViews(id), fv = pa.fourViews(id);
      out.push({ key, id, subject: pa.sizeKey(id), x: (main.x0 + main.x1) / 2, y: (main.y0 + main.y1) / 2, kind: LIBRARY[main.item].kind, view: id.startsWith('object8:') ? id.split(':').pop() : ax ? 'axis' + 'NESW'[ax.at] : fv ? ['NE', 'SE', 'SW', 'NW'][fv.at] : 'single' });
    }
    return out;
  });
  console.log('lots with a building:', lots.length);
  const isHouse = l => /house/.test(l.subject) || l.kind === 'house';
  const picks = [];
  for (const w of wanted) { const list = lots.filter(l => (w === 'house' ? isHouse(l) : l.subject === w)); picks.push(...list.slice(0, per).map(l => ({ ...l, want: w }))); if (!list.length) console.log('no lot shows', w); }
  const cells = [];
  for (const p of picks) {
    await page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); }, [p.x, p.y, ZOOM]);
    await sleep(500);
    await page.evaluate(() => { window.__calm = 0; });
    await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 12; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
    await sleep(300);
    const name = `${p.want.replace(/[:]/g, '-')}-${cells.filter(c => c.want === p.want).length + 1}`;
    const file = join(out, `town-${name}-${tag}.jpg`), png = await page.screenshot({ type: 'png' });
    await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
    cells.push({ want: p.want, name, file, png, id: p.id, view: p.view }); report.shots.push({ want: p.want, id: p.id, view: p.view, file }); console.log(file, p.id, p.view);
  }
  // one sheet of every shot, labelled
  const CW = 550, CH = 392, cols = 3, rows = Math.ceil(cells.length / cols), comp = [];
  for (const [i, c] of cells.entries()) {
    comp.push({ input: await sharp(c.png).resize(CW - 6, CH - 28, { fit: 'cover' }).png().toBuffer(), left: (i % cols) * CW + 3, top: Math.floor(i / cols) * CH + 24 });
    comp.push({ input: Buffer.from(`<svg width="${CW}" height="22" xmlns="http://www.w3.org/2000/svg"><text x="6" y="16" font-family="Segoe UI,Arial" font-size="14" fill="#ffd166">${c.want} · ${c.view} · ${c.id.replace(/&/g, '&amp;')}</text></svg>`), left: (i % cols) * CW, top: Math.floor(i / cols) * CH });
  }
  if (cells.length) await sharp({ create: { width: CW * cols, height: CH * rows, channels: 4, background: '#262b33' } }).composite(comp).png().toFile(join(out, `town-sheet-${tag}.png`));
  await ctx.close();
} finally { await browser.close(); }
writeFileSync(join(out, `town-${tag}.json`), JSON.stringify(report, null, 1));

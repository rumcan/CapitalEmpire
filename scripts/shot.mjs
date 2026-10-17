// Headless screenshots of the built game for visual verification: node scripts/shot.mjs
import puppeteer from '/tmp/pt/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('console', m => console.log('[console]', m.type(), m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('file://' + root + '/dist/index.html');
await page.waitForFunction(() => !document.body.innerText.includes('Painting ground textures'), { timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
const out = (n) => path.join(root, 'ref', n);
await page.screenshot({ path: out('shot_overview.png') });
// run arbitrary steps passed as JSON in argv[2]
const steps = process.argv[2] ? JSON.parse(process.argv[2]) : [];
for (const s of steps) {
  if (s.eval) await page.evaluate(s.eval);
  if (s.wait) await new Promise(r => setTimeout(r, s.wait));
  if (s.key) await page.keyboard.press(s.key);
  if (s.click) await page.mouse.click(s.click[0], s.click[1]);
  if (s.dblclick) await page.mouse.click(s.dblclick[0], s.dblclick[1], { clickCount: 2 });
  if (s.move) await page.mouse.move(s.move[0], s.move[1]);
  const at = async (t) => page.evaluate(([x, y]) => { const s = window.__game.screen(x, y); return [s.x / window.__game.dpr, s.y / window.__game.dpr]; }, t);
  if (s.clickTile) { const [x, y] = await at(s.clickTile); await page.mouse.move(x, y); await page.mouse.click(x, y); }
  if (s.dblclickTile) { const [x, y] = await at(s.dblclickTile); await page.mouse.move(x, y); await page.mouse.click(x, y, { clickCount: 2 }); }
  if (s.moveTile) { const [x, y] = await at(s.moveTile); await page.mouse.move(x, y); }
  if (s.dragTile) { const [x0, y0] = await at(s.dragTile[0]), [x1, y1] = await at(s.dragTile[1]); await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10); await page.mouse.up(); }
  if (s.shot) await page.screenshot({ path: out(s.shot), clip: s.clip });
}
await browser.close();

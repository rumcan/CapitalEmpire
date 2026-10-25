// P23 v2 captures from the running game (BASE, default http://127.0.0.1:5404/): today's screens (with the UI, for the before/after
// pairs) and clean backgrounds (UI hidden) for the mockups, on main after #205 (the wizard), #201 (3D collars), #194 (painted grass).
//   W=1600 H=900 node docs/plans/P23-ux/mockups/capture-v2.mjs        (and W=1366 H=768 for the laptop size)
// Writes PNGs to OUT (default E:/ClaudeTemp/ux/v2) and bg/v2-<W>.json with each shot's camera. Stop the dev server after.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const OUT = process.env.OUT || 'E:/ClaudeTemp/ux/v2';
fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.env.BASE || 'http://127.0.0.1:5404/') + '?unlock=0&money=0&grow=1&grid=0';
const browser = await chromium.launch({ channel: process.env.CH || 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = (fn, arg) => page.evaluate(fn, arg);
const note = (...a) => console.log('NOTE', ...a);
await page.goto(BASE);
for (const t0 = Date.now(); ;) { if (await g(() => !!window.__game?.ready).catch(() => false)) break; if (Date.now() - t0 > 240000) throw new Error('not ready'); await sleep(1000); }
await sleep(7000); // the ground bakes for a few seconds after ready (critique k01)
const meta = { W, H };
const tag = `${W}`;
const hideUi = async on => { await g(on => { let s = document.getElementById('ux-hide'); if (!s) { s = document.createElement('style'); s.id = 'ux-hide'; document.head.appendChild(s); } s.textContent = on ? '#root * { visibility: hidden !important; } #root canvas { visibility: visible !important; }' : ''; }, on); await sleep(250); };
const look = async (x, y, z, wait = 2500) => { await g(([x, y, z]) => window.__game.lookAt(x, y, z), [x, y, z]); await sleep(wait); };
const scr = (x, y) => g(([x, y]) => { const G = window.__game, z = G.cam.z; return { x: G.cssW / 2 + ((x - y) * 64 - G.cam.X) * z, y: G.cssH / 2 + ((x + y) * 32 - G.cam.Y) * z }; }, [x, y]);
const cam = () => g(() => { const G = window.__game; return { X: G.cam.X, Y: G.cam.Y, z: G.cam.z, w: G.cssW, h: G.cssH }; });
/** centres tile (x, y) in the free map right of the rail and panel (x from 450 px to W), not in the window's centre */
const lookFree = async (x, y, z, wait = 2500) => { await g(([x, y, z]) => { const G = window.__game; G.lookAt(x, y, z); G.cam.X -= 225 / z; G.clampCam(); G.emit(); }, [x, y, z]); await sleep(wait); };
/** the wizard's zoom: a 345 m par 4 fits beside the panel at 10% on 1600 px, at 8% on 1366 px (critique D1.1) */
const WZ = W >= 1600 ? 0.10 : 0.08;
async function shot(name, { ui = true, mouse = null } = {}) {
  if (mouse) await page.mouse.move(mouse.x, mouse.y); else if (!ui) await page.mouse.move(W - 2, H - 2);
  await sleep(700);
  if (!ui) await hideUi(true);
  await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
  if (!ui) await hideUi(false);
  meta[name] = await cam(); console.log('shot', name);
}
const panelBtn = async (re) => { const loc = page.locator('div.w-\\[330px\\] button', { hasText: re }); const c = await loc.count(); if (!c) { note('no panel button', re); return false; } await loc.first().click(); await sleep(450); return true; };

const st = await g(() => { const G = window.__game, q = G.golf; return { parcel: q.parcel, dir: q.dir, range: G.bizDefs.find(d => d.type === 'range') ?? null, tool: G.tool, mode: G.paint.mode }; });
meta.state = st; note('state', JSON.stringify(st));
// 1. the start, as the game opens it (today, with the UI), and clean
await shot('start-ui', { ui: true, mouse: { x: W * 0.62, y: H * 0.55 } });
await shot('start-bg', { ui: false });
// 2. today's Course panel close-up at 17% on the course land (the brush armed: the half grid shows)
const [px, py, pw, ph] = st.parcel, long = pw >= ph ? 'x' : 'y';
// the tee in the middle of the parcel's short side (clear of the 70-tile-wide range plot in its road corner), the green 172 tiles (344 m) along
const tee = long === 'x' ? { x: px + 40, y: py + Math.round(ph / 2) } : { x: px + Math.round(pw / 2), y: py + 40 };
const green = long === 'x' ? { x: tee.x + 172, y: tee.y + 12 } : { x: tee.x + 12, y: tee.y + 172 };
meta.tee = tee; meta.green = green;
const mid = { x: (tee.x + green.x) / 2, y: (tee.y + green.y) / 2 };
await look(mid.x, mid.y, 0.17);
let q = await scr(mid.x, mid.y);
await shot('course-17-ui', { ui: true, mouse: { x: q.x, y: q.y } });
// 3. the wizard (T102): + New hole, the tee, the live plan to the green, the shape step with handles and the pill (at 10%, where a par 4 fits)
await panelBtn(/^\+ New hole$/);
await lookFree(mid.x, mid.y, WZ);
q = await scr(tee.x, tee.y); await page.mouse.move(q.x, q.y); await sleep(500);
await shot('wizard-tee-ui', { ui: true, mouse: { x: q.x, y: q.y } });
await page.mouse.down(); await page.mouse.up(); await sleep(700);
q = await scr(green.x, green.y); await page.mouse.move(q.x, q.y); await sleep(900);
await shot('wizard-green-ui', { ui: true, mouse: { x: q.x, y: q.y } });
await page.mouse.down(); await page.mouse.up(); await sleep(900);
await page.mouse.move(W - 3, H - 3); await sleep(600);
await shot('wizard-shape-ui', { ui: true, mouse: { x: W - 3, y: H - 3 } });
await shot('wizard-shape-bg', { ui: false });
note('wizard', JSON.stringify(await g(() => { const w = window.__game.paint.wizard, gh = w.ghost(); return { step: w.step, hole: w.hole, par: gh?.info.par, len: gh?.info.lengthM, cost: gh?.cost, refused: gh?.refused }; })));
// 4. Build (Enter): the hole as it is laid (grow-in: brown with kerbs), at 17%
await page.keyboard.press('Enter'); await sleep(2500);
note('after build', JSON.stringify(await g(() => ({ money: window.__game.money, holes: window.__game.courseHoleViews().filter(v => v.started).map(v => ({ n: v.n, par: v.par, len: v.lengthM })) }))));
await g(() => window.__game.setTool('select'));
await look(mid.x, mid.y, 0.17, 3500);
await shot('built-17-bg', { ui: false });
await lookFree(mid.x, mid.y, WZ, 3500);
await shot('built-10-bg', { ui: false });
// 5. grow it in (Next season), then the backgrounds for the brush, paths and More options
await g(() => window.__game.skipToTournament()); await sleep(3000);
for (const t0 = Date.now(); ;) { if (!(await g(() => window.__game.traffic.skipping))) break; if (Date.now() - t0 > 300000) break; await sleep(2000); }
await g(() => { const G = window.__game; G.dismissSeasonReport?.(); G.setSpeed(0); }); await sleep(5000);
await look(mid.x, mid.y, 0.17, 3500); await shot('grown-17-bg', { ui: false });
await look(mid.x, mid.y, 0.30, 3500); await shot('grown-30-bg', { ui: false });
await lookFree(mid.x, mid.y, WZ, 3500); await shot('grown-10-bg', { ui: false });
await lookFree(mid.x, mid.y, 0.17, 3500); await shot('grown-17free-bg', { ui: false });
await look(green.x, green.y, 0.30, 3500); await shot('green-30-bg', { ui: false });
// the hole's green and the range front in one view (paths between them): the zoom that fits both beside the panel
if (st.range) {
  const rx = st.range.x + st.range.w / 2, ry = st.range.y + st.range.h / 2, dx = rx - green.x, dy = ry - green.y;
  const z = Math.min(0.17, (W - 560) / Math.max(1, Math.abs(dx - dy) * 64), (H - 260) / Math.max(1, Math.abs(dx + dy) * 32));
  meta.pathsZoom = z;
  await lookFree((green.x + rx) / 2, (green.y + ry) / 2, z, 3500); await shot('paths-bg', { ui: false });
}
// today's wizard waiting for the next tee (it stays in plan mode after Build), at 30% with the UI: the half grid over the course land
await g(() => window.__game.setTool('course')); await sleep(600);
await look(mid.x, mid.y, 0.30, 2500);
q = await scr(mid.x + 3, mid.y + 6);
await shot('wizard-next-30-ui', { ui: true, mouse: { x: q.x, y: q.y } });
// Esc in the tee step goes back to the brush: today's brush at 30% on the fairway's edge, with the UI
await page.keyboard.press('Escape'); await sleep(500);
await shot('brush-30-ui', { ui: true, mouse: { x: q.x + 160, y: q.y - 90 } });
// the brush over a growing hole: the same view right after a second Build is not needed; the built-17 shot shows the grow-in
fs.writeFileSync(path.join(HERE, 'bg', `v2-${tag}.json`), JSON.stringify(meta, null, 1));
if (errs.length) console.log('PAGE ERRORS', errs.join(' | '));
await browser.close();

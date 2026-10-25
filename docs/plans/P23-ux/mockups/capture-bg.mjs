// Captures the mockup backgrounds from the running game (a dev server: BASE, default http://127.0.0.1:5404/), with the game's UI hidden:
// a new range game; a generated hole 1 placed near the parcel's corner and grown in (Next season); framed at 17%, 30%, 8% and 12%.
// Writes bg/*.webp and bg/cameras.json (the camera of each, so the mockups' overlays sit on the real iso grid). Stop the server after.
//   node docs/plans/P23-ux/mockups/capture-bg.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(HERE, 'bg');
const BASE = (process.env.BASE || 'http://127.0.0.1:5404/') + '?unlock=0&money=0&grow=1';
const W = 1600, H = 900;
const browser = await chromium.launch({ channel: process.env.CH || 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = (fn, arg) => page.evaluate(fn, arg);
await page.goto(BASE);
for (const t0 = Date.now(); ;) { if (await g(() => !!window.__game?.ready).catch(() => false)) break; if (Date.now() - t0 > 240000) throw new Error('the game did not get ready'); await sleep(1000); }
await sleep(3500);
const meta = {};
const hideUi = async on => { await g(on => { let s = document.getElementById('ux-hide'); if (!s) { s = document.createElement('style'); s.id = 'ux-hide'; document.head.appendChild(s); } s.textContent = on ? '#root * { visibility: hidden !important; } #root canvas { visibility: visible !important; }' : ''; }, on); await sleep(300); };
const look = async (x, y, z) => { await g(([x, y, z]) => window.__game.lookAt(x, y, z), [x, y, z]); await sleep(2500); };
const scr = (x, y) => g(([x, y]) => { const G = window.__game, z = G.cam.z; return { x: G.cssW / 2 + ((x - y) * 64 - G.cam.X) * z, y: G.cssH / 2 + ((x + y) * 32 - G.cam.Y) * z }; }, [x, y]);
const cam = () => g(() => { const G = window.__game; return { X: G.cam.X, Y: G.cam.Y, z: G.cam.z, w: G.cssW, h: G.cssH }; });
async function capture(name) {
  await g(() => window.__game.setTool('select')); await page.mouse.move(W - 2, H - 2); await sleep(1800);
  await hideUi(true); const png = await page.screenshot(); await hideUi(false);
  await sharp(png).webp({ quality: 52, effort: 6 }).toFile(path.join(OUT, name + '.webp'));
  meta[name] = await cam(); console.log('bg', name);
}
const st = await g(() => { const G = window.__game, q = G.golf; return { parcel: q.parcel, range: G.bizDefs.find(d => d.type === 'range') ?? null }; });
meta.state = st;
await capture('start-17');
const [px, py] = st.parcel;
// hole 1: Presets > Generated, its tee at a click near the parcel's corner (the tools as they were on 2026-10-25; adjust if the panel changes)
await page.locator('button.rail-tab[title="Course"]').click(); await sleep(400);
await page.locator('div.w-\\[330px\\] button', { hasText: /^Presets$/ }).click(); await sleep(400);
await page.locator('div.w-\\[330px\\] button', { hasText: /^Generated: a new layout each time$/ }).click(); await sleep(400);
const tx = px + 50, ty = py + 60;
await look(tx + 40, ty + 40, 0.085);
const q = await scr(tx, ty); await page.mouse.move(q.x, q.y); await sleep(800); await page.mouse.down(); await page.mouse.up(); await sleep(2500);
const h1 = await g(() => { const q = window.__game.golf; return { tees: q.tees.filter(t => t.hole === 1), pin: q.pins.find(p => p.hole === 1) ?? null }; });
const tee = h1.tees.find(t => t.kind === 'back') ?? h1.tees[0] ?? { x: tx, y: ty }, pin = h1.pin ?? { x: tx + 110, y: ty };
meta.hole1 = { tee, pin };
await g(() => { window.__game.setTool('select'); window.__game.skipToTournament(); });
await sleep(3000);
for (const t0 = Date.now(); ;) { if (!(await g(() => window.__game.traffic.skipping))) break; if (Date.now() - t0 > 300000) break; await sleep(2000); }
await g(() => { const G = window.__game; G.dismissSeasonReport?.(); G.setSpeed(0); });
await sleep(5000);
const mx = (tee.x + pin.x) / 2, my = (tee.y + pin.y) / 2;
await look(mx + 50, my + 30, 0.17); await capture('hole1-17');
await look(mx, my, 0.30); await capture('fairway-30');
await look(pin.x - 15, pin.y + 80, 0.08); await capture('wide-08');
await look(mx, my + 25, 0.12); await capture('hole1-12');
fs.writeFileSync(path.join(OUT, 'cameras.json'), JSON.stringify(meta, null, 1));
console.log('the mockups hard-code the cameras of the 2026-10-25 capture: update their cam lines from cameras.json');
await browser.close();

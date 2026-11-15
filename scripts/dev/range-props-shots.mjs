// #1302 (the owner, 2026-11-15, a green painted on the desert outfield: "drew a green on the range but the rocks stayed and i cant bulldoze them, I should be able to place
// props on the range ... I cant place a flag at all atm ... the flags on the range are still not in their holes"). The play-through that checks it on a new bare range
// start (desert, real money): the five target greens bought, each green's pin standing in its cup (the pole's foot on the green's middle, pixels and all); a green painted
// with the Texture Painter over a thick patch of the desert's rocks and plants clears them (undo brings them back, redo takes them again); a flag pole, a flag pin and a
// boulder placed on the painted green; the bulldozer takes a rock on its own; all of it survives a save and a load.
//   node scripts/dev/range-props-shots.mjs --base http://127.0.0.1:5197/ --out F:/ClaudeTemp/jam/range-props [--seed 1]
// One headless Chrome on a scratch port of your own (vite --port <n> --strictPort, NEVER 5174/5175/5191/5270/5280), closed when done; a fresh profile, so the start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5197/'), out = opt('out', 'output/range-props'), seed = opt('seed', '1');
const W = 1600, H = 1000;
mkdirSync(out, { recursive: true });
const t0 = Date.now(), lap = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const settle = async (page, ms = 700) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name, clip) => { const file = join(out, `${name}.jpg`), png = await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) }); await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(file); console.log('  ' + file); };
const lookAt = (page, p, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [p.x, p.y, z]);
const screenOf = (page, p) => page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [p.x, p.y]);
const homePt = (page, u, v) => page.evaluate(([u, v]) => {
  const g = window.__game, [px, py] = g.golf.range.home, f = g.golf.dir, Wp = 70, D = 150;
  return f === 2 ? { x: px + u, y: py + v } : f === 0 ? { x: px + Wp - u, y: py + D - v } : f === 1 ? { x: px + v, y: py + Wp - u } : { x: px + D - v, y: py + u };
}, [u, v]);
const plotPt = (page, u, v) => page.evaluate(([u, v]) => {
  const g = window.__game, sc = g.range.scene, px = sc.box[0], py = sc.box[1], f = sc.facing, Wp = 70, D = 150;
  return f === 2 ? { x: px + u, y: py + v } : f === 0 ? { x: px + Wp - u, y: py + D - v } : f === 1 ? { x: px + v, y: py + Wp - u } : { x: px + D - v, y: py + u };
}, [u, v]);
const hover = async (page, p) => { const s = await screenOf(page, p); await page.mouse.move(s.x, s.y); await page.waitForTimeout(250); return s; };
const click = async (page, p) => { await hover(page, p); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400); };
const stroke = async (page, a, b) => {
  const s = await screenOf(page, a), e = await screenOf(page, b);
  await page.mouse.move(s.x, s.y); await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(s.x + (e.x - s.x) * i / 24, s.y + (e.y - s.y) * i / 24);
  await page.mouse.up(); await page.waitForTimeout(150);
};
/** the desert's natural pieces standing within r tiles of p (scene keys) */
const scatterNear = (page, p, r) => page.evaluate(([x, y, r]) => window.__game.range.scene.pieces.filter(q => /^(desert|oasis)\d+$/.test(q.key) && Math.hypot(q.x - x, q.y - y) <= r).map(q => q.key), [p.x, p.y, r]);
const cleared = page => page.evaluate(() => [...(window.__game.golf.range.cleared ?? [])]);
/** each pin's foot on the screen (its picture's anchor: the pole's foot in the cup ring) against its green's middle, css px; and the pole's x in the picture */
const pinFeet = page => page.evaluate(() => {
  const g = window.__game, sc = g.range.scene, out = [];
  for (const [i, t] of sc.targets.entries()) {
    const p = [...g.props].find(q => q.auto === `range:flag${i}`); if (!p) { out.push(null); continue; }
    const c = g.screen(t.x, t.y), f = g.screen(p.x, p.y);
    out.push({ i, dx: (f.x - c.x) / g.dpr, dy: (f.y - c.y) / g.dpr, tiles: Math.hypot(p.x - t.x, p.y - t.y) });
  }
  return out;
});

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(`${base}?start=range&seed=${seed}&desert=on&money=0`, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.ready && window.__game.range?.bareGate, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.traffic.spend('construction', -900000); });
  await page.evaluate(() => { const g = window.__game, p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
  lap('ready');
  await page.evaluate(() => window.__game.placeRangePart('range'));
  await lookAt(page, await homePt(page, 35, 60), 0.08); await settle(page, 600);
  await click(page, await homePt(page, 35, 12));
  await page.evaluate(() => window.__game.placeRangePart('carpark'));
  await lookAt(page, await homePt(page, 59, -10), 0.2); await settle(page, 600);
  await click(page, await homePt(page, 59, -10));
  await page.evaluate(() => { const g = window.__game; g.setTool('select'); g.range.buy('greens'); g.range.buy('targets'); g.openRangeCard(false); g.emit(); });
  await page.waitForTimeout(800);
  const nT = await page.evaluate(() => window.__game.range.scene?.targets.length ?? 0);
  check(nT === 5, `the five target greens are built (${nT})`);
  lap('range placed');

  // ---- 1: the pins stand in their cups: the foot of each pole on its green's middle (the picture's anchor), and a close look at each green
  const feet = await pinFeet(page);
  for (const f of feet) check(!!f && f.tiles < 0.01, `pin ${f?.i}: placed on its green's middle (${f ? f.tiles.toFixed(3) : 'none'} tiles off)`);
  for (let i = 0; i < nT; i++) {
    const t = await page.evaluate(i => { const s = window.__game.range.scene.targets[i]; return { x: s.x, y: s.y }; }, i);
    await lookAt(page, t, 0.3); await settle(page, 600); await page.mouse.move(8, 8);
    await shot(page, `1-target-green-${i + 1}-pin-in-cup`, { x: W / 2 - 260, y: H / 2 - 260, width: 520, height: 380 });
  }

  // ---- 2: a green painted over a thick patch of the desert's rocks and plants
  let best = null;
  for (let v = 40; v <= 130; v += 3) for (let u = 10; u <= 60; u += 3) {
    const p = await plotPt(page, u, v), n = (await scatterNear(page, p, 2.8)).length;
    if (!best || n > best.n) best = { u, v, p, n };
  }
  const G = best.p; console.log(`  the paint spot: u ${best.u} v ${best.v}, ${best.n} desert pieces within 2.8 tiles`);
  check(best.n >= 2, 'a patch of the outfield thick with the desert\'s rocks and plants');
  await lookAt(page, G, 0.22); await settle(page, 900); await page.mouse.move(8, 8);
  const clip = { x: W / 2 - 420, y: H / 2 - 300, width: 840, height: 560 };
  await shot(page, '2-outfield-rocks-before-paint', clip);
  const under0 = await scatterNear(page, G, 2.8);
  await page.evaluate(() => { const g = window.__game; g.openPropertyPaint('green'); g.paint.setBrushCells(0); g.paint.setBrushR(3.5); });
  await stroke(page, { x: G.x - 1.2, y: G.y }, { x: G.x + 1.2, y: G.y });
  await page.evaluate(() => window.__game.setTool('select')); await page.mouse.move(8, 8);
  await settle(page, 1500);
  const c1 = await cleared(page), under1 = await scatterNear(page, G, 2.8);
  check(under0.length > 0 && under0.every(k => c1.includes(k)), `the paint cleared the ${under0.length} pieces under it (${under0.join(' ')})`);
  check(under1.length === 0, `none stands on the painted green (${under1.join(' ') || 'none'})`);
  await shot(page, '3-green-painted-rocks-gone', clip);
  // undo brings them back, redo takes them again
  await page.evaluate(() => window.__game.paint.undo()); await page.waitForTimeout(500);
  const back = await scatterNear(page, G, 2.8);
  check(under0.every(k => back.includes(k)), `undo: the pieces are back (${back.length}/${under0.length})`);
  await page.evaluate(() => window.__game.paint.redo()); await page.waitForTimeout(500);
  check((await scatterNear(page, G, 2.8)).length === 0, 'redo: gone again');

  // ---- 3: props on the painted green: a flag pole in the middle, a flag pin and a boulder beside it
  await page.evaluate(() => window.__game.setTool('props'));
  const place = async (key, p) => {
    await page.evaluate(k => window.__game.decor.pick(k), key); await hover(page, p); await page.waitForTimeout(200);
    const why = await page.evaluate(() => window.__game.decor.ghost?.why ?? 'no ghost');
    const n0 = await page.evaluate(() => window.__game.props.size);
    await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400);
    const n1 = await page.evaluate(() => window.__game.props.size);
    check(why === '' && n1 === n0 + 1, `${key} placed on the painted green (${why || 'no refusal'})`);
  };
  await lookAt(page, G, 0.22); await settle(page, 600);
  await place('flagpole', G);
  await place('newprop-flag-pin', { x: G.x + 1.6, y: G.y - 1.2 });
  await place('kit-boulder-m', { x: G.x - 1.8, y: G.y + 1.2 });
  await page.evaluate(() => { const g = window.__game; g.decor.pick(null); g.setTool('select'); }); await page.mouse.move(8, 8); await settle(page, 900);
  await shot(page, '4-flag-and-rock-placed-on-green', clip);
  // a flag on a target green too
  const t0p = await page.evaluate(() => { const s = window.__game.range.scene.targets[1]; return { x: s.x + 1.5, y: s.y + 1 }; });
  await page.evaluate(() => window.__game.setTool('props')); await lookAt(page, t0p, 0.22); await settle(page, 500);
  await page.evaluate(() => window.__game.decor.pick('kit-boulder-m')); await hover(page, t0p);
  check(await page.evaluate(() => window.__game.decor.ghost?.why ?? 'no ghost') === '', 'a boulder may stand on a target green');
  await page.evaluate(() => { const g = window.__game; g.decor.pick(null); g.setTool('select'); });

  // ---- 4: the bulldozer takes a rock of the outfield on its own
  const rock = await page.evaluate(([x, y]) => { const g = window.__game, sc = g.range.scene; const qs = sc.pieces.filter(q => /^desert\d+$/.test(q.key) && Math.hypot(q.x - x, q.y - y) > 6).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)); const q = qs[0]; const p = [...g.props].find(r => r.auto === 'range:' + q.key); return { key: q.key, x: q.x, y: q.y, cx: (p.x0 + p.x1) / 2, cy: (p.y0 + p.y1) / 2 }; }, [G.x, G.y]);
  await lookAt(page, rock, 0.3); await settle(page, 600);
  await page.evaluate(() => window.__game.setTool('bulldoze'));
  // (the picture's opaque middle: a little above its foot on the screen)
  const rs = await screenOf(page, rock); let took = false;
  for (const dy of [-6, -12, -3, -20, 0]) { await page.mouse.move(rs.x, rs.y + dy); await page.waitForTimeout(250); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400); if ((await cleared(page)).includes(rock.key)) { took = true; break; } }
  check(took, `the bulldozer took ${rock.key} (a click on it)`);
  await page.evaluate(() => window.__game.setTool('select'));

  // ---- 4b: a later stroke over a prop the player placed takes it as the bulldozer would (half its price back); undo puts it back
  {
    // (on the bare desert beside the green: a brush lays only over a lower surface, so rough never paints over the green itself)
    await lookAt(page, G, 0.22); await settle(page, 500);
    await page.evaluate(() => window.__game.setTool('props')); await page.evaluate(() => window.__game.decor.pick('kit-boulder-m'));
    let B = null;
    for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6], [6, 6], [-6, -6]]) { const q = { x: G.x + dx, y: G.y + dy }; await hover(page, q); if (await page.evaluate(() => window.__game.decor.ghost?.why === '')) { B = q; break; } }
    if (B) { await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400); }
    await page.evaluate(() => { const g = window.__game; g.decor.pick(null); g.setTool('select'); });
    B ??= G;
    const count = () => page.evaluate(([x, y]) => [...window.__game.props].filter(p => !p.auto && Math.hypot(p.x - x, p.y - y) < 0.3).length, [B.x, B.y]);
    const n0 = await count(), m0 = await page.evaluate(() => window.__game.money);
    await page.evaluate(() => { const g = window.__game; g.openPropertyPaint('rough'); g.paint.setBrushCells(0); g.paint.setBrushR(1.2); });
    await stroke(page, { x: B.x - 0.3, y: B.y }, { x: B.x + 0.3, y: B.y });
    await page.evaluate(() => window.__game.setTool('select')); await page.waitForTimeout(400);
    const n1 = await count(), m1 = await page.evaluate(() => window.__game.money);
    check(n0 === 1 && n1 === 0, `a stroke of rough over the placed boulder took it (${n0} -> ${n1}; money ${Math.round(m1 - m0)})`);
    await page.evaluate(() => window.__game.paint.undo()); await page.waitForTimeout(400);
    check(await count() === 1, 'undo: the boulder is back');
  }

  // ---- 5: save and load: the cleared pieces stay gone, the props stay
  const before = { cleared: await cleared(page), props: await page.evaluate(() => [...window.__game.props].filter(p => !p.auto).length) };
  await page.evaluate(() => window.__game.save()); await page.waitForTimeout(1500);
  await page.reload({ timeout: 240000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.ready && window.__game.range?.scene, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; });
  const after = { cleared: await cleared(page), props: await page.evaluate(() => [...window.__game.props].filter(p => !p.auto).length) };
  check(JSON.stringify(before.cleared) === JSON.stringify(after.cleared) && (await scatterNear(page, G, 2.8)).length === 0, `after a save and a load the ${after.cleared.length} cleared pieces stay gone`);
  check(after.props === before.props, `the placed props are still there (${after.props})`);
  await lookAt(page, G, 0.22); await settle(page, 1500); await page.mouse.move(8, 8);
  await shot(page, '5-after-save-and-load', clip);
  const feet2 = await pinFeet(page);
  check(feet2.every(f => f && f.tiles < 0.01), 'the pins still on their greens\' middles after the load');
} finally { await browser.close(); }
lap(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);

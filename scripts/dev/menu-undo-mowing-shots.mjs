// T359 (#1006): in-game checks and shots of the three fixes on the old start (?start=town: a seeded town, the old nine, the clubhouse):
//  1. Ctrl+Z undoes menu settings too: a texture pick, a slider's drag (one step, with the slider still in focus), Apply to all holes, the brush's
//     size; Ctrl+Y does them again; the real keyboard and pointer, read back from the Paint tool;
//  2. Course > Holes > Shape by hand > Fairway (and the other surfaces) opens that surface's panel on the Course default, its look selected;
//  3. the Mowing lines section of the Fairway panel: on or off, the pattern (along the hole, straight, checkerboard, diamond), the band width,
//     how light and dark, the angle; a fairway before and after, every pattern, saved and undone.
//   node scripts/dev/menu-undo-mowing-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T359 [--seed 7] [--only flyout,mowing,undo]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; fresh profile, no saves written (non-GET requests are answered
// locally). The exit code is 1 when any check failed; each stage runs on its own.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'E:/ClaudeTemp/T359'), seed = opt('seed', '7'), only = new Set(opt('only', 'flyout,mowing,undo').split(','));
const W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const stage = async (name, f) => { console.log(`== ${name}`); try { await f(); } catch (e) { console.log(`FAIL stage "${name}": ${String(e.stack ?? e.message).split('\n').slice(0, 3).join(' | ')}`); bad++; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => { await page.mouse.move(4, 4); await sleep(250); const f = join(out, `${name}.png`); await page.screenshot({ path: f }); console.log('  shot ' + f); return f; };
const state = page => page.evaluate(() => { const p = window.__game.paint; return { owner: p.lookOwner, kind: p.brushKind, mode: p.mode, hole: p.brushHole, mow: p.style.mow ?? null, tex: p.style.tex, cells: p.brushCells, undo: p.undoLabel, canUndo: p.canUndo, canRedo: p.canRedo }; });
/** a flyout walk: the rail group's button, then each column's row (a key, or a text) */
async function walk(page, group, ...rows) {
  await page.keyboard.press('Escape'); await sleep(200);
  await page.click(`[data-rail="${group}"]`); await sleep(350);
  for (const [level, row] of rows.entries()) {
    const sel = row.startsWith('=') ? page.locator(`[data-flyout-col="${level}"] [role="menuitem"]`, { hasText: row.slice(1) }) : page.locator(`[data-flyout-col="${level}"] [data-key="${row}"]`);
    await sel.first().click(); await sleep(350);
  }
}
const chip = (page, text) => page.locator('[data-surface-focus] button', { hasText: new RegExp(`^${text}$`) }).first();
/** the slider with this label: a real drag from its left to `to` (0..1 of its width), pointer down, moves, pointer up */
async function dragSlider(page, label, to, steps = 14) {
  const el = page.locator(`input[aria-label="${label}"]`).first(), b = await el.boundingBox();
  const y = b.y + b.height / 2, x0 = b.x + 4, x1 = b.x + 4 + (b.width - 8) * to;
  await page.mouse.move(x0, y); await page.mouse.down();
  for (let k = 1; k <= steps; k++) await page.mouse.move(x0 + (x1 - x0) * k / steps, y);
  await page.mouse.up();
}

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); g.closeWelcome?.(false); g.setShowGrid?.(false); window.__night = 0; g.nightAmount = () => window.__night; g.emit(); });
  await settle(page, 1500);
  // the hole with the most fairway: its fairway's middle (tiles)
  const spot = await page.evaluate(() => {
    const g = window.__game.courseGrid, CT = 0.5, by = new Map();
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const c = j * g.w + i; if (g.surf[c] === 4 && g.hole[c]) { const o = by.get(g.hole[c]) ?? { n: 0, x: 0, y: 0 }; o.n++; o.x += g.x0 + (i + 0.5) * CT; o.y += g.y0 + (j + 0.5) * CT; by.set(g.hole[c], o); } }
    let best = null; for (const [h, o] of by) if (!best || o.n > best.n) best = { h, n: o.n, x: o.x / o.n, y: o.y / o.n };
    return best;
  });
  console.log('hole', JSON.stringify(spot));
  const look = (x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);

  // ---------- 2. the flyout: Shape by hand > Fairway opens the Fairway panel on the Course default ----------
  if (only.has('flyout')) await stage('flyout opens the surface on the Course default', async () => {
    await look(spot.x, spot.y, 0.3); await settle(page, 1200);
    await page.evaluate(() => { const g = window.__game; g.setTool('select'); g.emit(); });
    await walk(page, 'course', 'holes', 'shape', '=Fairway');
    await sleep(500);
    const st = await state(page);
    check(st.kind === 'fairway' && st.mode === 'brush', `the fairway brush is armed (${st.kind}, ${st.mode})`);
    check(st.owner === 'default', `the Course default owns the look (${st.owner})`);
    check(await page.locator('[data-surface-focus="fairway"]').count() === 1, 'the Fairway panel is in focus, not the swatches');
    check(await page.locator('[data-swatch]').count() === 0, 'no All surfaces swatches');
    check((await chip(page, 'Course default').getAttribute('aria-pressed')) === 'true', 'Course default is lit');
    check((await chip(page, 'This hole').getAttribute('aria-pressed')) === 'false', 'This hole is not');
    check(await page.locator('[data-quick-textures] [data-texture-picker="quick-fill"]').count() === 1 && await page.locator('[data-quick-textures] [data-texture-picker="quick-border"]').count() === 1, 'the main and the border texture show');
    await shot(page, '1-fairway-panel-from-flyout');
    // the back link still goes back to the swatches
    await page.locator('[data-focus-back]').click(); await sleep(300);
    check(await page.locator('[data-swatch]').count() >= 4, '‹ All surfaces goes back to the swatches');
    // the other surfaces: each opens its own panel on the Course default
    for (const [name, kind] of [['Green', 'green'], ['Tee', 'tee'], ['Rough', 'rough'], ['Bunker', 'bunker'], ['Water', 'water'], ['Waste area', 'waste'], ['Long grass', 'longGrass']]) {
      await page.evaluate(() => { const p = window.__game.paint; p.setLookDefault(false, false); p.setHole(1); window.__game.emit(); });
      await walk(page, 'course', 'holes', 'shape', `=${name}`); await sleep(300);
      const s = await state(page);
      const ok = s.kind === kind && s.owner === 'default' && await page.locator(`[data-surface-focus="${kind}"]`).count() === 1 && (await chip(page, 'Course default').getAttribute('aria-pressed')) === 'true';
      check(ok, `${name}: its own panel, on the Course default (${s.kind}, ${s.owner})`);
      if (kind === 'green') await shot(page, '2-green-panel-from-flyout');
    }
  });

  // ---------- 3. the Mowing lines section, and a fairway before and after ----------
  if (only.has('mowing')) await stage('mowing lines', async () => {
    await page.evaluate(([h]) => { const g = window.__game; g.setTool('select'); g.paint.setLookDefault(false, false); g.paint.setHole(h); g.emit(); }, [spot.h]);
    await walk(page, 'course', 'holes', 'shape', '=Fairway'); await sleep(400);
    await chip(page, 'This hole').click(); await sleep(300);
    check((await state(page)).owner === `h${spot.h}`, `This hole: hole ${spot.h}'s own look`);
    const sec = page.locator('[data-mowing="fairway"]');
    check(await sec.count() === 1, 'the Mowing lines section is in the Fairway panel');
    check((await sec.getAttribute('data-mow-on')) === 'on' && (await sec.getAttribute('data-mow-pattern')) === 'along', 'on, along the hole: today\'s look');
    await sec.scrollIntoViewIfNeeded(); await sleep(200);
    await sec.screenshot({ path: join(out, '3-mowing-lines-section.png') }); console.log('  shot ' + join(out, '3-mowing-lines-section.png'));
    // the fairway before: the camera on the hole, the bands along it
    await look(spot.x, spot.y, 0.3); await settle(page, 1500);
    await shot(page, '4-fairway-0-before-along');
    const variants = [
      ['Checkerboard', '4-fairway-1-checkerboard', async () => {}],
      ['Diamond', '4-fairway-2-diamond', async () => {}],
      ['Straight', '4-fairway-3-straight-30', async () => { await page.locator('input[aria-label="Mowing angle"]').focus(); for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowRight'); }],
      ['Along the hole', '4-fairway-4-wide-strong', async () => { await dragSlider(page, 'Mowing band width', 0.34); await dragSlider(page, 'Dark bands', 1); await dragSlider(page, 'Light bands', 1); }],
    ];
    for (const [name, file, extra] of variants) {
      await chip(page, name).click(); await sleep(200); await extra(); await settle(page, 1200);
      const s = await state(page);
      check(!!s.mow, `${name}: the look carries its mowing lines ${JSON.stringify(s.mow)}`);
      await shot(page, file);
    }
    // off, then the panel says so; the saved look keeps it
    await page.locator('[data-mow="off"]').click(); await settle(page, 1200);
    check(((await state(page)).mow ?? {}).on === false, 'Off: the fairway is mown plain');
    await shot(page, '4-fairway-5-off');
    // Ctrl+Z puts the lines back (the settings are undo steps): off undone, then the others in turn
    await page.keyboard.press('Control+z'); await settle(page, 1200);
    check(((await state(page)).mow ?? {}).on !== false, 'Ctrl+Z: the lines are back');
    await shot(page, '4-fairway-6-undo-off');
    // the Course default's own: the finish's bands on a hole that wears no look of its own
    await page.evaluate(() => { const g = window.__game; g.emit(); });
  });

  // ---------- 1. Ctrl+Z puts menu settings back ----------
  if (only.has('undo')) await stage('ctrl+z undoes menu settings', async () => {
    await page.evaluate(([h]) => { const g = window.__game; g.setTool('select'); g.paint.setLookDefault(false, false); g.paint.setHole(h); g.emit(); }, [spot.h]);
    await walk(page, 'course', 'holes', 'shape', '=Fairway'); await sleep(400);
    await chip(page, 'This hole').click(); await sleep(300);
    await look(spot.x, spot.y, 0.3); await settle(page, 1500);
    // (a) a texture pick
    const t0 = (await state(page)).tex;
    const opts = await page.evaluate(() => { document.querySelector('[data-texture-picker="quick-fill"] [data-texture-current]').click(); return [...document.querySelectorAll('[data-texture-picker="quick-fill"] [data-texture-option]')].map(e => e.dataset.textureOption); });
    await sleep(200);
    const pickId = opts.find(o => /sand|bunker|dirt|gravel/i.test(o) && o !== t0) ?? opts.find(o => o !== t0);
    await page.locator(`[data-texture-picker="quick-fill"] [data-texture-option="${pickId}"]`).first().click(); await settle(page, 1500);
    const t1 = (await state(page)).tex; check(t1 === pickId && t1 !== t0, `a texture pick: ${t0} -> ${t1}`);
    await shot(page, '5-texture-picked');
    await page.keyboard.press('Control+z'); await settle(page, 1500);
    const t2 = await state(page); check(t2.tex === t0, `Ctrl+Z puts the texture back (${t2.tex})`);
    await shot(page, '5-texture-after-ctrl-z');
    await page.keyboard.press('Control+y'); await settle(page, 800);
    check((await state(page)).tex === t1, 'Ctrl+Y does the pick again');
    await page.keyboard.press('Control+Shift+z'); await sleep(200); // (nothing more to redo)
    await page.keyboard.press('Control+z'); await settle(page, 800);
    check((await state(page)).tex === t0, 'and Ctrl+Z again');
    // (b) a slider's drag is one step, and Ctrl+Z works with the slider still in focus (the click leaves the focus on it)
    const mw = () => page.evaluate(() => window.__game.paint.style.mow?.width ?? null);
    const w0 = await mw();
    await dragSlider(page, 'Mowing band width', 0.12); const w1 = await mw();
    await dragSlider(page, 'Mowing band width', 0.62, 20); const w2 = await mw();
    check(w0 !== w1 && w1 !== w2, `two drags of the band width slider: ${w0} -> ${w1} -> ${w2}`);
    const focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName);
    check(focus === 'Mowing band width', `the slider keeps the focus (${focus})`);
    await page.keyboard.press('Control+z'); await sleep(300);
    const a = await mw(); check(a === w1, `one Ctrl+Z from the slider took the second drag back whole (${w2} -> ${a})`);
    await page.keyboard.press('Control+z'); await sleep(300);
    const b = await mw(); check(b === w0, `the next took the first drag back (${a} -> ${b})`);
    await page.keyboard.press('Control+y'); await sleep(200); await page.keyboard.press('Control+Shift+z'); await sleep(300);
    check(await mw() === w2, 'Ctrl+Y and Ctrl+Shift+Z do them again');
    await shot(page, '6-after-slider-drags');
    // (c) Apply to all holes is one step
    const other = await page.evaluate(h => { const l = window.__game.golf.looks ?? {}; return Object.keys(l).map(k => +k.slice(1)).find(n => n && n !== h) ?? 0; }, spot.h);
    const lookOf = n => page.evaluate(n => JSON.stringify(window.__game.golf.looks[`h${n}`]?.fairway ?? null), n);
    const o0 = await lookOf(other);
    await page.locator('[data-focus-scope] button', { hasText: 'Apply to all holes' }).click(); await sleep(400);
    const lab = (await state(page)).undo, o1 = await lookOf(other);
    check(/apply the fairway look to all holes/.test(lab) && o1 !== o0, `Apply to all holes: hole ${other}'s look changed, the step is "${lab}"`);
    await page.keyboard.press('Control+z'); await sleep(400);
    check(await lookOf(other) === o0 && !/apply the fairway/.test((await state(page)).undo), `one Ctrl+Z took Apply to all holes back (hole ${other})`);
    await page.keyboard.press('Control+y'); await sleep(300);
    check(await lookOf(other) === o1, 'and Ctrl+Y does it again');
    await page.keyboard.press('Control+z'); await sleep(300);
    // (d) the brush's size
    const c0 = (await state(page)).cells;
    await page.locator('[aria-label="Brush size"] button', { hasText: '3×3' }).first().click(); await sleep(200);
    const c1 = (await state(page)).cells; check(c1 === 3, `the brush is 3x3 (${c1})`);
    await page.keyboard.press('Control+z'); await sleep(300);
    check((await state(page)).cells === c0, 'Ctrl+Z puts the brush size back');
    await shot(page, '6-brush-size-undone');
  });
  await ctx.close();
} finally { await browser.close(); }
console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);

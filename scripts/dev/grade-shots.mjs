// T226 (#652): in-game shots of the golden-hour colour grade (src/game/grade.ts) with the grade off, then on, from the same view: the grown town
// (?fixture=range20) at 30% and 15%, its range at 30%, a course hole at 30% (?start=town, the old nine), a dusk view, and the edge blur on; a sheet
// with the graded town beside the owner's concept picture (docs/art/concept/maple-falls-concept.webp); the GPU's curve checked against
// grade.ts gradeRgb at the screen's centre; and the frame time, synchronous (the draw, then a 1 px read that waits for the GPU), off, on and
// with the edge blur, at 30% and 15%.
//   node scripts/dev/grade-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T226 [--only town,range,course,dusk,blur,sheet,check,time]
//     [--grade '{"strength":1}'] [--tag v2]
// Needs a dev server (vite) on --base. One headless Edge at a time, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/grade-shots'), tag = opt('tag', '') ? `-${opt('tag', '')}` : '';
const only = new Set(opt('only', 'town,range,course,dusk,blur,sheet,check,time').split(',')), extra = JSON.parse(opt('grade', '{}'));
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
/** wait until no chunk bake is in flight for a second (at most 60 s) */
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name) => {
  const file = join(out, `${name}${tag}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
/** a fresh page on `url` (a new game or a fixture), loaded, the UI hidden, the game paused */
const open = async url => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; });
  return { page, ctx };
};
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => window.__game.lookAt(x, y, z), [x, y, z]);
/** the grade: off, or on with the tuned look (and `extra`, a tuning override from --grade), the edge blur as asked */
const grade = (page, on, blur = false) => page.evaluate(([on, blur, extra]) => { window.__game.setGrade({ strength: 1, ...extra, on, edgeBlur: blur }); }, [on, blur, extra]);
const pair = async (page, name, blur = false) => {
  const files = [];
  for (const on of [false, true]) { await grade(page, on, on && blur); await page.waitForTimeout(400); files.push(await shot(page, `${name}-${on ? (blur ? 'blur' : 'on') : 'off'}`)); }
  return files;
};
/** the densest town spot: the built lot (BUILT or UPGRADED) whose 40-tile neighbourhood holds the most built lots */
const townSpot = page => page.evaluate(() => {
  const g = window.__game, all = [...g.traffic.lots.values()], built = all.filter(l => l.level >= 2);
  const mids = built.map(l => ({ x: l.o[0] + l.u[0] * l.w / 2 + l.n[0] * l.d / 2, y: l.o[1] + l.u[1] * l.w / 2 + l.n[1] * l.d / 2 }));
  let best = null, bestN = -1;
  for (let i = 0; i < mids.length; i += Math.max(1, Math.floor(mids.length / 600))) { const c = mids[i], n = mids.filter(m => Math.hypot(m.x - c.x, m.y - c.y) < 40).length; if (n > bestN) { bestN = n; best = c; } }
  return { ...best, n: bestN, built: mids.length, lots: all.length };
});
const report = {};
try {
  const files = {};
  // ---- the grown town and its range (?fixture=range20)
  if (['town', 'range', 'dusk', 'blur', 'sheet', 'check', 'time'].some(k => only.has(k))) {
    const { page, ctx } = await open(`${base}?fixture=range20`);
    const town = await townSpot(page); report.town = town; console.log('town', JSON.stringify(town));
    const range = await page.evaluate(() => {
      const s = window.__game.range.scene; if (!s) return null;
      const t = s.teeBox, n = t.length / 2; let x = 0, y = 0; for (let i = 0; i < t.length; i += 2) { x += t[i]; y += t[i + 1]; }
      const far = s.targets.length ? s.targets[Math.floor(s.targets.length / 2)] : null;
      return { tee: [x / n, y / n], target: far ? [far.x, far.y] : null };
    });
    report.range = range; console.log('range', JSON.stringify(range));
    if (only.has('town') || only.has('sheet')) {
      await look(page, town.x, town.y, 0.3); await settle(page); files.town30 = await pair(page, 'town-30pct');
      await look(page, town.x, town.y, 0.15); await settle(page); files.town15 = await pair(page, 'town-15pct');
    }
    if (only.has('range') && range) {
      const [x, y] = range.target ? [range.tee[0] * 0.6 + range.target[0] * 0.4, range.tee[1] * 0.6 + range.target[1] * 0.4] : range.tee;
      await look(page, x, y, 0.3); await settle(page); files.range30 = await pair(page, 'range-30pct');
    }
    if (only.has('dusk')) {
      await look(page, town.x, town.y, 0.3); await settle(page);
      for (const [name, v] of [['dusk', 0.45], ['night', 1]]) { await page.evaluate(v => { window.__night = v; }, v); await page.waitForTimeout(300); files[name] = await pair(page, `${name}-30pct`); }
      await page.evaluate(() => { window.__night = 0; });
    }
    if (only.has('blur')) {
      await look(page, town.x, town.y, 0.3); await settle(page); files.blur30 = await pair(page, 'blur-town-30pct', true);
      await look(page, town.x, town.y, 0.15); await settle(page); files.blur15 = await pair(page, 'blur-town-15pct', true);
    }
    // ---- the GPU's curve against grade.ts: a 96 x 96 px block at the screen's centre (inside the vignette's start), off then on
    if (only.has('check')) {
      await look(page, town.x, town.y, 0.3); await settle(page);
      report.check = await page.evaluate(async () => {
        const g = window.__game, gl = g.gl.gl, m = await import('/src/game/grade.ts'), S = 96, x0 = (g.cw - S) >> 1, y0 = (g.ch - S) >> 1;
        const read = () => { cancelAnimationFrame(g.raf); g.draw(performance.now()); const px = new Uint8Array(S * S * 4); gl.readPixels(x0, y0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px); g.raf = requestAnimationFrame(g.frame); return px; };
        g.setGrade({ on: false }); const a = read(), a2 = read();
        g.setGrade({ on: true, strength: 1, edgeBlur: false }); const b = read();
        let still = 0, maxd = 0, sum = 0, n = 0, moved = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (a[i] !== a2[i] || a[i + 1] !== a2[i + 1] || a[i + 2] !== a2[i + 2]) { still++; continue; }
          const want = m.gradeRgb(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255, 1);
          for (let c = 0; c < 3; c++) { const d = Math.abs(want[c] * 255 - b[i + c]); maxd = Math.max(maxd, d); sum += d; n++; if (a[i + c] !== b[i + c]) moved++; }
        }
        return { px: S * S, unstable: still, maxDiff: +maxd.toFixed(2), meanDiff: +(sum / Math.max(1, n)).toFixed(3), channelsMoved: `${(100 * moved / Math.max(1, n)).toFixed(1)}%` };
      });
      console.log('check', JSON.stringify(report.check));
    }
    // ---- the frame time: off, on, on with the edge blur; three rounds of 240 frames each, at 30% and 15%, the town at the centre
    if (only.has('time')) {
      report.frame = {};
      for (const z of [0.3, 0.15]) {
        await look(page, town.x, town.y, z); await settle(page);
        for (let round = 0; round < 3; round++) for (const [mode, on, blur] of [['off', false, false], ['on', true, false], ['blur', true, true]]) {
          await grade(page, on, blur); await page.waitForTimeout(200);
          const t = await page.evaluate(() => {
            const g = window.__game, gl = g.gl.gl, px = new Uint8Array(4); cancelAnimationFrame(g.raf);
            for (let i = 0; i < 20; i++) { g.draw(performance.now()); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
            const ts = []; for (let i = 0; i < 240; i++) { const a = performance.now(); g.draw(a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - a); }
            g.raf = requestAnimationFrame(g.frame); ts.sort((a, b) => a - b);
            return { median: +ts[120].toFixed(2), p95: +ts[228].toFixed(2), mean: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2), gpuMB: +(g.gl.gradeBytes / 1048576).toFixed(1) };
          });
          (report.frame[`${Math.round(z * 100)}pct-${mode}`] ??= []).push(t);
        }
      }
      console.log('frame', JSON.stringify(report.frame));
    }
    await ctx.close();
  }
  // ---- a course hole (?start=town: the old nine)
  if (only.has('course')) {
    const { page, ctx } = await open(`${base}?start=town`);
    const hole = await page.evaluate(() => { const g = window.__game; for (const n of [3, 2, 1, 4, 5]) { const b = g.paint.holeBox(n); if (b) return { n, b }; } return null; });
    report.hole = hole; console.log('hole', JSON.stringify(hole));
    if (hole) { const b = hole.b; await look(page, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 0.3); await settle(page); files.course30 = await pair(page, 'course-30pct'); }
    await ctx.close();
  }
  // ---- the sheet: the town off, on, and the concept, each the same height, labelled
  if (only.has('sheet') && files.town15) {
    const h = 520, gap = 8, lab = 26;
    const cells = [[files.town15[0], 'our town 15%, grade off'], [files.town15[1], 'our town 15%, grade on'], ['docs/art/concept/maple-falls-concept.webp', 'the concept']];
    const bufs = await Promise.all(cells.map(([f]) => sharp(f).resize({ height: h }).png().toBuffer({ resolveWithObject: true })));
    const Wd = bufs.reduce((s, b) => s + b.info.width, 0) + gap * (bufs.length - 1);
    let x = 0; const comp = [];
    const label = Buffer.from(`<svg width="${Wd}" height="${lab}" xmlns="http://www.w3.org/2000/svg">${bufs.map((b, i) => { const t = `<text x="${x + b.info.width / 2}" y="18" font-family="Arial" font-size="16" text-anchor="middle" fill="#fff">${cells[i][1]}</text>`; x += b.info.width + gap; return t; }).join('')}</svg>`);
    comp.push({ input: label, left: 0, top: 0 }); x = 0;
    for (const b of bufs) { comp.push({ input: b.data, left: x, top: lab }); x += b.info.width + gap; }
    const file = join(out, `sheet-town-vs-concept${tag}.jpg`);
    await sharp({ create: { width: Wd, height: h + lab, channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
    console.log(file);
    if (files.range30) {
      const cells2 = [[files.range30[0], 'our range 30%, grade off'], [files.range30[1], 'our range 30%, grade on'], ['docs/art/concept/maple-falls-concept.webp', 'the concept']];
      const b2 = await Promise.all(cells2.map(([f]) => sharp(f).resize({ height: h }).png().toBuffer({ resolveWithObject: true })));
      const W2 = b2.reduce((s, b) => s + b.info.width, 0) + gap * (b2.length - 1); let x2 = 0;
      const lab2 = Buffer.from(`<svg width="${W2}" height="${lab}" xmlns="http://www.w3.org/2000/svg">${b2.map((b, i) => { const t = `<text x="${x2 + b.info.width / 2}" y="18" font-family="Arial" font-size="16" text-anchor="middle" fill="#fff">${cells2[i][1]}</text>`; x2 += b.info.width + gap; return t; }).join('')}</svg>`);
      const c2 = [{ input: lab2, left: 0, top: 0 }]; x2 = 0; for (const b of b2) { c2.push({ input: b.data, left: x2, top: lab }); x2 += b.info.width + gap; }
      const f2 = join(out, `sheet-range-vs-concept${tag}.jpg`);
      await sharp({ create: { width: W2, height: h + lab, channels: 3, background: '#111' } }).composite(c2).jpeg({ quality: 90, mozjpeg: true }).toFile(f2);
      console.log(f2);
    }
  }
  writeFileSync(join(out, `numbers${tag}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }

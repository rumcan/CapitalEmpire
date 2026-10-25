// The no-repeat check (T082, the owner 2026-10-25: "If we ever see a repeating pattern something is wrong"): the game's ground painter bakes an
// open, flat, all-grass piece of ground (scripts/perf/grass-repeat.html: no roads, lots, trees, map decals or mowing stripes) at each camera zoom
// from 30% to the district view, and this measures its luminance autocorrelation (Pearson r between the ground and itself shifted by a lag):
//   - r at the painted blend's period and twice it, along both tile axes and the diagonal (a repeat there shows as r near 1);
//   - the highest r outside the autocorrelation's central lobe (a second peak at any lag past 12 m: a repeat at any period is found);
//   - the brush strokes' direction: how parallel they run across the whole view (viewCoherence, spread) and r along them 12 m and 24 m on;
// each on the ground as baked and on its detail alone (a 6 m blur subtracted, so the slow colour drift cannot hide or fake a repeat).
// Fails (exit 1) when a painted level's r at its period, or its detail's second peak, passes LIMIT (0.2; a repeat gives 0.8 to 1). The photo grass is measured too (--photo), for the record.
// --families all (or a comma list of painted-families.json ids) lays each family on the open ground in turn (as painted: no tint, tone or scale)
// and measures it at every zoom; without it, the map grass as the game has it (painted-surfaces.json).
//   node scripts/perf/grass-repeat.mjs [url of a dev server, default http://127.0.0.1:5341/] [--photo] [--dpr 2] [--shots dir] [--size 2048] [--limit 0.2] [--families all|id,...] [--zooms 0.3,0.15]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const base = (args.find(a => a.startsWith('http')) ?? 'http://127.0.0.1:5341/').replace(/\/?$/, '/');
const LOBE = 0.1, dpr = +opt('dpr', '2'), SIZE = +opt('size', '2048'), shots = opt('shots', ''), LIMIT = +opt('limit', '0.2');
const ZOOMS = opt('zooms', '') ? opt('zooms', '').split(',').map(Number) : [0.3, 0.2, 0.15, 0.1, 0.075, 0.05, 0.035];
const arts = args.includes('--photo') ? ['painted', 'photo'] : ['painted'];

const lumOf = async png => { const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const n = info.width * info.height, L = new Float64Array(n); for (let i = 0; i < n; i++) L[i] = 0.3 * data[i * 3] + 0.59 * data[i * 3 + 1] + 0.11 * data[i * 3 + 2]; return { L, W: info.width, H: info.height }; };
/** a box blur of radius r px (separable, edges clamped) */
function blur(a, W, H, r) {
  const t = new Float64Array(a.length), o = new Float64Array(a.length), k = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { t[y * W + x] = s / k; s += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { o[y * W + x] = s / k; s += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } }
  return o;
}
/** Pearson r between the image and itself shifted by (dx, dy) px, over their overlap */
function pearson(a, W, H, dx, dy) {
  const x0 = Math.max(0, -dx), x1 = Math.min(W, W - dx), y0 = Math.max(0, -dy), y1 = Math.min(H, H - dy);
  if (x1 - x0 < 16 || y1 - y0 < 16) return NaN;
  let sa = 0, sb = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sa += a[y * W + x]; sb += a[(y + dy) * W + x + dx]; n++; }
  const ma = sa / n, mb = sb / n; let ab = 0, aa = 0, bb = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = a[y * W + x] - ma, q = a[(y + dy) * W + x + dx] - mb; ab += p * q; aa += p * p; bb += q * q; }
  return ab / Math.sqrt(aa * bb || 1);
}
/* ---- 2D FFT (radix 2, in place) for the peak search ---- */
function fft1(re, im, n, inv) {
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
function fft2(re, im, N, inv) {
  const r = new Float64Array(N), i = new Float64Array(N);
  for (let y = 0; y < N; y++) { for (let x = 0; x < N; x++) { r[x] = re[y * N + x]; i[x] = im[y * N + x]; } fft1(r, i, N, inv); for (let x = 0; x < N; x++) { re[y * N + x] = r[x]; im[y * N + x] = i[x]; } }
  for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) { r[y] = re[y * N + x]; i[y] = im[y * N + x]; } fft1(r, i, N, inv); for (let y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = i[y]; } }
}
/** the highest autocorrelation outside the central lobe (and past minLag px), on a copy F times smaller, zero-padded so it is not circular:
 *  r, its lag in px (full size) and how far the lobe reached */
function peakSearch(a, W, H, minLag, F = 4) {
  const w = Math.floor(W / F), h = Math.floor(H / F), N = 1 << Math.ceil(Math.log2(2 * Math.max(w, h))), re = new Float64Array(N * N), im = new Float64Array(N * N), ones = new Float64Array(N * N), oi = new Float64Array(N * N);
  const s = new Float64Array(w * h); let m = 0;
  for (let y = 0; y < h * F; y++) for (let x = 0; x < w * F; x++) s[Math.floor(y / F) * w + Math.floor(x / F)] += a[y * W + x] / (F * F);
  for (const v of s) m += v / s.length;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { re[y * N + x] = s[y * w + x] - m; ones[y * N + x] = 1; }
  fft2(re, im, N, false); fft2(ones, oi, N, false);
  for (let k = 0; k < N * N; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; ones[k] = ones[k] * ones[k] + oi[k] * oi[k]; oi[k] = 0; }
  fft2(re, im, N, true); fft2(ones, oi, N, true);
  // the central lobe: every lag joined to lag 0 through lags with r over LOBE (a broad soft painting keeps r high for a while, which is not a
  // repeat); a repeat shows as a second peak outside it
  const r0 = re[0] / ones[0], hw = w >> 1, hh = h >> 1, rAt = (x, y) => { const k = ((y + N) % N) * N + (x + N) % N; return ones[k] < (w * h) / 4 ? -1 : re[k] / ones[k] / r0; };
  const lobe = new Uint8Array(w * h), idx = (x, y) => (y + hh) * w + (x + hw), stack = [[0, 0]]; lobe[idx(0, 0)] = 1;
  while (stack.length) { const [x, y] = stack.pop(); for (const [u, v] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (u < -hw || u >= hw || v < -hh || v >= hh || lobe[idx(u, v)]) continue; if (rAt(u, v) > LOBE || Math.hypot(u, v) * F < minLag) { lobe[idx(u, v)] = 1; stack.push([u, v]); } } }
  let best = -1, bx = 0, by = 0, reach = 0;
  for (let y = -hh; y < hh; y++) for (let x = -hw; x < hw; x++) { if (lobe[idx(x, y)]) { reach = Math.max(reach, Math.hypot(x, y) * F); continue; } const r = rAt(x, y); if (r > best) { best = r; bx = x * F; by = y * F; } }
  return { r: best, dx: bx, dy: by, lobe: reach };
}
/** the strokes' direction (the owner, 2026-10-25: parallel streaks across the whole view read as a pattern), measured on the ground itself
 *  (top-down, in tile space): on screen every ground texture is squashed 2:1 by the iso view, which flattens any direction towards the
 *  horizontal, so the screen gradients are taken back to tile space first (g_tile = A^T g_screen, A = the tile-to-screen matrix). Per block of
 *  B px, the gradient structure tensor; streak = the direction along the strokes on the ground (degrees, 0 = along tile x, 90 = along tile y),
 *  blockCoherence = how strongly a block is streaked (0..1), viewCoherence = how parallel the streaks are over the whole view (1 = every block
 *  the same way), spread = the coherence-weighted circular spread of the blocks' directions (degrees) */
function streaks(a, W, H, B) {
  let C = 0, Sn = 0, cw = 0, Jxx = 0, Jyy = 0, Jxy = 0, nb = 0, cs = 0;
  for (let by = 0; by + B <= H - 1; by += B) for (let bx = 0; bx + B <= W - 1; bx += B) {
    let xx = 0, yy = 0, xy = 0;
    for (let y = Math.max(1, by); y < by + B; y++) for (let x = Math.max(1, bx); x < bx + B; x++) {
      const sx = a[y * W + x + 1] - a[y * W + x - 1], sy = a[(y + 1) * W + x] - a[(y - 1) * W + x], gx = 64 * sx + 32 * sy, gy = -64 * sx + 32 * sy;
      xx += gx * gx; yy += gy * gy; xy += gx * gy;
    }
    const c = Math.sqrt((xx - yy) ** 2 + 4 * xy * xy) / (xx + yy || 1), phi = 0.5 * Math.atan2(2 * xy, xx - yy);
    C += c * Math.cos(2 * phi); Sn += c * Math.sin(2 * phi); cw += c; Jxx += xx; Jyy += yy; Jxy += xy; nb++; cs += c;
  }
  const Rbar = Math.sqrt(C * C + Sn * Sn) / (cw || 1), streak = ((0.5 * Math.atan2(Sn, C)) * 180 / Math.PI + 90 + 180) % 180;
  return { streak: +streak.toFixed(1), blockCoherence: +(cs / nb).toFixed(3), viewCoherence: +(Math.sqrt((Jxx - Jyy) ** 2 + 4 * Jxy * Jxy) / (Jxx + Jyy)).toFixed(3), spread: +(Math.sqrt(-2 * Math.log(Math.max(1e-9, Rbar))) / 2 * 180 / Math.PI).toFixed(1) };
}
/** an image lag (px at level L) as tiles along the tile axes */
const lagTiles = (dx, dy, L) => { const X = dx / L, Y = dy / L; return [(X / 64 + Y / 32) / 2, (Y / 32 - X / 64) / 2]; };

const browser = await chromium.launch({ channel: opt('channel', 'msedge'), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let failed = false; const rows = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(base + 'scripts/perf/grass-repeat.html');
  await page.waitForFunction(() => window.probeReady, null, { timeout: 180000 }); await page.evaluate(() => window.probeReady);
  const famArg = opt('families', ''), all = await page.evaluate(() => window.families);
  const fams = !famArg ? [null] : famArg === 'all' ? all.map(f => f.id) : famArg.split(',');
  for (const family of fams) for (const art of family ? ['painted'] : arts) for (const zoom of ZOOMS) {
    const res = await page.evaluate(o => window.probe(o), { zoom, dpr, art, size: SIZE, look: family ? { family } : null });
    const png = Buffer.from(res.png, 'base64');
    if (shots) { fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, `repeat-${family ?? art}-${String(Math.round(zoom * 1000)).padStart(3, '0')}.png`), png); }
    const { L: lum, W, H } = await lumOf(png), L = res.L, pxPerM = 35.78 * L, hp = blur(lum, W, H, Math.max(1, Math.round(6 * pxPerM)));
    const detail = lum.map((v, i) => v - hp[i]);
    // every level the zoom blends: its period and twice it, along both tile axes and the diagonal (a lag past the window is left out)
    const lagsAt = (P, n) => [[P * n, 0], [0, P * n], [P * n, P * n]].map(([tx, ty]) => [Math.round((tx - ty) * 64 * L), Math.round((tx + ty) * 32 * L)]);
    const at = img => Math.max(-1, ...res.periods.flatMap(P => [1, 2].flatMap(n => lagsAt(P, n).map(([dx, dy]) => pearson(img, W, H, dx, dy)))).filter(Number.isFinite));
    const minLag = 12 * pxPerM, pkRaw = peakSearch(lum, W, H, minLag), pkDet = peakSearch(detail, W, H, minLag);
    let sd = 0, mu = 0; for (const v of lum) mu += v / lum.length; for (const v of lum) sd += (v - mu) ** 2 / lum.length;
    // the streaks, and the autocorrelation along them 12 m and 24 m on (a streak running on across the view keeps r high there): the lag is m
    // metres along the streak on the ground, as screen px
    const st = streaks(detail, W, H, Math.max(16, Math.round(8 * pxPerM))), ang = st.streak * Math.PI / 180;
    const along = m => { const tx = Math.cos(ang) * m / 2, ty = Math.sin(ang) * m / 2; return pearson(detail, W, H, Math.round((tx - ty) * 64 * L), Math.round((tx + ty) * 32 * L)); };
    const row = { family: family ?? '(game)', art, zoom, artL: res.artL, L, levels: res.levels, period: art === 'painted' ? res.periods.map(P => `${+(P * 2).toFixed(1)} m`).join(' + ') : '-', rAtPeriod: art === 'painted' ? +at(lum).toFixed(3) : null, rAtPeriodDetail: art === 'painted' ? +at(detail).toFixed(3) : null,
      peak: +pkRaw.r.toFixed(3), peakLag: lagTiles(pkRaw.dx, pkRaw.dy, L).map(v => +(v * 2).toFixed(1)).join(',') + ' m', peakDetail: +pkDet.r.toFixed(3), peakDetailLag: lagTiles(pkDet.dx, pkDet.dy, L).map(v => +(v * 2).toFixed(1)).join(',') + ' m', lobeDetail: Math.round(pkDet.lobe / pxPerM) + ' m', ...st, rAlong12m: +along(12).toFixed(3), rAlong24m: +along(24).toFixed(3), lumStd: +Math.sqrt(sd).toFixed(1), msPerChunk: res.msPerChunk };
    // the verdict: r at the blend's period (as baked and detail only) and the detail's second peak at any lag. The second peak as baked is
    // reported but not judged: the drift's 56-160 m waves give the estimate a +-0.2 noise at long lags over a window only a few waves wide
    const worst = Math.max(row.rAtPeriod ?? -1, row.rAtPeriodDetail ?? -1, row.peakDetail);
    row.verdict = worst > LIMIT ? 'REPEATS' : 'ok'; if (art === 'painted' && worst > LIMIT) failed = true;
    rows.push(row); console.log(JSON.stringify(row));
  }
} finally { await browser.close(); }
fs.mkdirSync('output/bench', { recursive: true }); fs.writeFileSync('output/bench/grass-repeat.json', JSON.stringify(rows, null, 1));
console.log(failed ? `FAIL: a painted level repeats (r > ${LIMIT})` : `ok: no painted level repeats (every r <= ${LIMIT})`);
process.exit(failed ? 1 : 0);

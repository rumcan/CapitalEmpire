// J11 (#1270): "listens" to every synthesized sound without ears. It renders each recipe of src/game/sound/recipes.ts offline in the installed Chrome
// (playwright-core, channel 'chrome', an OfflineAudioContext: no speakers, no sound card) and checks what a listener would notice first:
//   - not silent (peak above -40 dBFS), no clipping (peak under -1 dBFS), loud enough and not too loud: peak between -18 and -6 dBFS
//   - how long it is: until it has fallen 40 dB below its own peak; every UI sound under 200 ms (the chimes and the ding excepted), every sound within its maxMs
//   - its brightness (the share of its energy above 4 kHz: a shrill sound shows here) and whether it starts at once
// Then it times a burst of 20 UI sounds on a real AudioContext (the cost of making the nodes) and prints the table (markdown with --md).
//   node scripts/jam/sound-levels.mjs [--md] [--json out.json] [--suggest]        exit 1 when a sound breaks a rule; --suggest prints the TRIM numbers
//   that put every sound's peak on its TARGET_DB (recipes.ts)
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), has = k => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PEAK_MIN = -18, PEAK_MAX = -6, CLIP = -1, SILENT = -40, UI_MAX_MS = 200, SR = 44100;

// the recipes as one browser script (no DOM, no Web Audio in them but the nodes they are handed)
const bundle = await build({ entryPoints: [resolve(ROOT, 'src/game/sound/recipes.ts')], bundle: true, format: 'iife', globalName: 'Recipes', write: false, logLevel: 'error', target: 'es2020' });
const script = bundle.outputFiles[0].text;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('about:blank');
await page.addScriptTag({ content: script });

const rows = await page.evaluate(async ([SR]) => {
  const out = [];
  Recipes.rng.next = () => 0.5; // still: the same render every time
  const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  for (const S of Recipes.SOUNDS) {
    const T0 = 0.02, len = Math.ceil((S.maxMs / 1000 + 0.5) * SR);
    const ctx = new OfflineAudioContext(2, len, SR);
    S.recipe(ctx, ctx.destination, T0, 1);
    const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    let peak = 0; for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; }
    const thr = peak * 0.01; // 40 dB under its own peak
    let first = -1, last = -1; for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > thr) { if (first < 0) first = i; last = i; } }
    let e = 0, eHi = 0, prevL = 0, lpL = 0; // brightness: energy above ~4 kHz by a one-pole highpass (x minus its lowpass)
    const k = 1 - Math.exp(-2 * Math.PI * 4000 / SR);
    for (let i = Math.max(0, first); i <= last && i < n; i++) { const x = L[i]; lpL += k * (x - lpL); const h = x - lpL; e += x * x; eHi += h * h; prevL = x; }
    out.push({ id: S.id, group: S.group, maxMs: S.maxMs, rise: !!S.rise, trim: Recipes.TRIM[S.id] ?? 1, target: Recipes.TARGET_DB[S.id] ?? null, peakDb: db(peak), lenMs: first < 0 ? 0 : (last - first) / SR * 1000, startMs: first < 0 ? -1 : (first / SR - T0) * 1000, rmsDb: e > 0 ? db(Math.sqrt(e / Math.max(1, last - first + 1))) : -Infinity, hiPct: e > 0 ? 100 * eHi / e : 0 });
  }
  return out;
}, [SR]);

// a burst of 20 UI sounds on a real context: what making their nodes costs the page
const burst = await page.evaluate(() => {
  const ctx = new AudioContext(), ui = ['click', 'tick', 'on', 'off', 'open', 'close', 'cash', 'refuse'].map(id => Recipes.SOUNDS.find(s => s.id === id).recipe);
  const bus = ctx.createGain(); bus.connect(ctx.destination);
  for (const r of ui) r(ctx, bus, ctx.currentTime, 1); // (warm up: the noise buffer, the JIT)
  const times = [];
  for (let rep = 0; rep < 5; rep++) { const t0 = performance.now(); for (let k = 0; k < 20; k++) ui[k % ui.length](ctx, bus, ctx.currentTime + 0.01 * k, 1); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  const r = { state: ctx.state, medianMs: times[2], worstMs: times[4], perSoundMs: times[2] / 20 };
  ctx.close();
  return r;
});
await browser.close();

const fmt = x => (Number.isFinite(x) ? x.toFixed(1) : '-inf');
const problems = [];
for (const r of rows) {
  const why = [];
  if (!(r.peakDb > SILENT)) why.push('silent');
  else {
    if (r.peakDb > CLIP) why.push('clips');
    if (r.peakDb > PEAK_MAX) why.push(`peak above ${PEAK_MAX} dBFS`);
    if (r.peakDb < PEAK_MIN) why.push(`peak under ${PEAK_MIN} dBFS`);
    if (r.lenMs > r.maxMs) why.push(`longer than ${r.maxMs} ms`);
    if (r.group === 'ui' && r.maxMs <= UI_MAX_MS && r.lenMs > UI_MAX_MS) why.push(`a UI sound over ${UI_MAX_MS} ms`);
    if (r.startMs > 30 && !r.rise) why.push(`starts ${r.startMs.toFixed(0)} ms late`);
  }
  r.verdict = why.length ? why.join(', ') : 'ok';
  if (why.length) problems.push(`${r.id}: ${r.verdict}`);
}
if (has('md')) {
  console.log('| sound | group | peak dBFS | rms dBFS | length ms | above 4 kHz | verdict |\n|---|---|---:|---:|---:|---:|---|');
  for (const r of rows) console.log(`| ${r.id} | ${r.group} | ${fmt(r.peakDb)} | ${fmt(r.rmsDb)} | ${r.lenMs.toFixed(0)} | ${r.hiPct.toFixed(0)}% | ${r.verdict} |`);
} else {
  console.log('sound'.padEnd(16) + 'group'.padEnd(6) + 'peak'.padStart(8) + 'rms'.padStart(8) + 'len ms'.padStart(8) + 'hi %'.padStart(6) + '  verdict');
  for (const r of rows) console.log(r.id.padEnd(16) + r.group.padEnd(6) + fmt(r.peakDb).padStart(8) + fmt(r.rmsDb).padStart(8) + r.lenMs.toFixed(0).padStart(8) + r.hiPct.toFixed(0).padStart(6) + '  ' + r.verdict);
}
console.log(`\nburst of 20 UI sounds (real AudioContext, state ${burst.state}): median ${burst.medianMs.toFixed(2)} ms to build all 20 (${(burst.perSoundMs * 1000).toFixed(0)} us each), worst of 5 ${burst.worstMs.toFixed(2)} ms`);
if (errors.length) { console.log('page errors:\n  ' + errors.join('\n  ')); problems.push(`${errors.length} page error(s)`); }
if (has('suggest')) console.log('\nTRIM = {' + rows.map(r => `${/^[a-z]+$/i.test(r.id) ? r.id : `'${r.id}'`}: ${(r.target === null ? r.trim : Math.round(r.trim * 10 ** ((r.target - r.peakDb) / 20) * 100) / 100)}`).join(', ') + ' }');
const jsonOut = opt('json', null);
if (jsonOut) { mkdirSync(dirname(resolve(jsonOut)), { recursive: true }); writeFileSync(resolve(jsonOut), JSON.stringify({ rows, burst }, null, 1)); }
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.join('\n  ')}` : `\nall ${rows.length} sounds pass (peak ${PEAK_MIN}..${PEAK_MAX} dBFS, no clipping, none silent, UI sounds under ${UI_MAX_MS} ms)`);
process.exit(problems.length ? 1 : 0);

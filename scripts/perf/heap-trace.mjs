// The JS heap of the bench's page (?bench=1&fixture=range20, a dev server) through the load and after it, with the least instrument, so the number means what it says (T375).
//   node scripts/perf/heap-trace.mjs [url] [--runs 2] [--after 25] [--poll 100] [--precise] [--out heap.json]
// What the bench calls "heap" is performance.memory.usedJSHeapSize. It is three things added up (what CDP's Runtime.getHeapUsage lists apart): the V8 heap (usedSize: the JS objects, the dead
// ones too until a collection), Blink's own heap (embedderHeapUsedSize) and the typed arrays' and ArrayBuffers' backing stores (backingStorageSize: decoded pictures, meshes, the
// load's scratch arrays). Dead ones stay in all three until a full collection, and V8 starts one when its own heap grows: how much garbage the page carries depends on when one
// happens to run. So this reads the three apart, every --poll ms (default 100: the load's spike is a second long and a 1 s poll misses it), and then forces one collection
// for what the page really keeps. Per load (a warm-up load first, so the dev server's transforms are out of the timing): after the load (game ready), the peak, the end
// (--after s later, default 25) and what is kept after a full collection, each as V8 / typed arrays / performance.memory in MB. Nothing is traced or sampled: those change
// when the collector runs (a traced load collected at the spike, an untraced one did not). The bench's browser flags; --precise adds --enable-precise-memory-info (performance.memory
// is bucketed and refreshed every 20 s without it).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => (args.includes('--' + k) ? args[args.indexOf('--' + k) + 1] : d);
const base = args.find(a => a.startsWith('http')) || 'http://[::1]:5174/', runs = +opt('runs', 2), after = +opt('after', 25), pollMs = +opt('poll', 100);
const outFile = path.resolve(opt('out', 'output/heap/heap-trace.json'));
const browser = await chromium.launch({ channel: opt('channel', 'msedge'), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader=false', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', ...(args.includes('--precise') ? ['--enable-precise-memory-info'] : [])] });
const mb = x => Math.round((x ?? 0) / 1048576);
async function load() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  const series = []; let stop = false, lastPm = 0, pm = 0; const t0 = Date.now();
  const poll = (async () => {
    while (!stop) {
      try {
        const u = await cdp.send('Runtime.getHeapUsage');
        if (Date.now() - lastPm >= 1000) { pm = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576)); lastPm = Date.now(); }
        series.push({ t: (Date.now() - t0) / 1000, v8: mb(u.usedSize), emb: mb(u.embedderHeapUsedSize), back: mb(u.backingStorageSize), pm });
      } catch { /* the page is loading */ }
      await new Promise(r => setTimeout(r, pollMs));
    }
  })();
  await page.goto(`${base}?bench=1&fixture=range20`, { timeout: 300000, waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 300000 }).catch(() => console.log('(not ready)'));
  const readyAt = (Date.now() - t0) / 1000;
  await new Promise(r => setTimeout(r, after * 1000));
  stop = true; await poll;
  const last = series.at(-1) ?? { v8: 0, emb: 0, back: 0, pm: 0 };
  // (the heap profiler is switched on only now, for one forced collection: what the page keeps)
  await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage'); await new Promise(r => setTimeout(r, 1500)); await cdp.send('HeapProfiler.collectGarbage');
  const k = await cdp.send('Runtime.getHeapUsage'), keptPm = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
  await ctx.close();
  const ready = series.filter(s => s.t <= readyAt).at(-1) ?? series[0] ?? { v8: 0, back: 0, pm: 0 };
  return {
    readyAtSec: +readyAt.toFixed(1),
    afterLoad: { v8: ready.v8, typedArrays: ready.back, performanceMemory: ready.pm },
    peak: { v8: Math.max(...series.map(s => s.v8)), typedArrays: Math.max(...series.map(s => s.back)), performanceMemory: Math.max(...series.map(s => s.pm)) },
    end: { v8: last.v8, typedArrays: last.back, performanceMemory: last.pm },
    kept: { v8: mb(k.usedSize), typedArrays: mb(k.backingStorageSize), performanceMemory: keptPm },
    series: series.filter((s, i, a) => i === 0 || Math.floor(s.t) !== Math.floor(a[i - 1].t)).map(s => `${s.t.toFixed(0)}:${s.v8}+${s.emb}+${s.back}=${s.pm}`).join(' '),
  };
}
await load(); console.log('(warm-up load done)');
const results = [];
const f = r => `${r.v8} / ${r.typedArrays} / ${r.performanceMemory}`;
for (let i = 0; i < runs; i++) {
  const r = await load(); results.push(r);
  console.log(`load ${i + 1}: ready ${r.readyAtSec} s | after load ${f(r.afterLoad)} | peak ${f(r.peak)} | end ${f(r.end)} | kept after a full collection ${f(r.kept)}   (MB: V8 / typed arrays / performance.memory)`);
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ base, poll: pollMs, after, results }, null, 1));
console.log('written', outFile);
await browser.close();

// What a page of the game costs in memory (T157): one headless Edge, one page, then after an idle wait and a forced GC
//   - the Chromium memory-infra dump per process (allocators: worker canvases, decoded images, ArrayBuffers, V8 heaps, GPU shared images),
//   - each Edge process's private bytes and working set (SystemInfo.getProcessInfo + Win32_Process),
//   - each one's VRAM from Windows' "GPU Process Memory" counters,
//   - the engine's own numbers (__game: the atlas plan, the ground cache, the workers).
// The lot lab used about 4.2 GB of renderer + GPU memory on the full boot and about 1.3 GB on the light one (issue #336). Windows only (the
// process list and the GPU counters come from PowerShell). Run one at a time on this PC: the browser takes 1.5-6 GB while it measures.
//   node scripts/perf/memory.mjs <url> <label> [--idle 25] [--generate 3] [--dpr 1.25] [--w 1600] [--h 900] [--channel msedge]
//   e.g. node scripts/perf/memory.mjs "http://localhost:5188/?lotlab&dev" lab --generate 3
// --generate N clicks the lot lab's Generate N times and measures again. Writes output/memory/mem-<label>.json and prints a summary.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2), url = args[0], label = args[1] ?? 'page';
if (!url) { console.error('usage: node scripts/perf/memory.mjs <url> <label> [--idle s] [--generate n] [--dpr d]'); process.exit(2); }
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const gens = +opt('generate', '0'), idle = +opt('idle', '25'), dpr = +opt('dpr', '1.25'), W = +opt('w', '1600'), H = +opt('h', '900');
const MB = b => Math.round(b / 1048576 * 10) / 10, sleep = ms => new Promise(r => setTimeout(r, ms));
const ps = cmd => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });

const browser = await chromium.launch({ channel: opt('channel', 'msedge'), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader=false', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const out = { url, label, dpr, viewport: [W, H], when: new Date().toISOString(), samples: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
  const page = await ctx.newPage(), bcdp = await browser.newBrowserCDPSession(), pcdp = await ctx.newCDPSession(page);
  await pcdp.send('Performance.enable');
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000, polling: 500 });
  /** s seconds, then until the ground cache has nothing wanted or in flight (30 s at most) */
  const settle = async s => {
    await sleep(s * 1000);
    for (let k = 0; k < 60; k++) { if (!(await page.evaluate(() => { const g = window.__game.ground; return g.want.length + g.inflight.reduce((a, b) => a + b, 0); }))) break; await sleep(500); }
  };
  /** one memory-infra dump: the allocators of each process (top level and the ones worth naming) */
  const infra = async types => {
    await bcdp.send('Tracing.start', { traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: ['disabled-by-default-memory-infra'], excludedCategories: ['*'], memoryDumpConfig: { triggers: [] } }, transferMode: 'ReturnAsStream' });
    await bcdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' });
    const done = new Promise(res => bcdp.once('Tracing.tracingComplete', res));
    await bcdp.send('Tracing.end');
    const { stream } = await done; let data = '';
    for (;;) { const c = await bcdp.send('IO.read', { handle: stream, size: 1 << 20 }); data += c.base64Encoded ? Buffer.from(c.data, 'base64').toString() : c.data; if (c.eof) break; }
    await bcdp.send('IO.close', { handle: stream });
    const tr = JSON.parse(data), byPid = {};
    for (const e of tr.traceEvents ?? tr) {
      if (e.ph !== 'v' || !e.args?.dumps) continue;
      const d = e.args.dumps, P = byPid[`${types[e.pid] ?? '?'}:${e.pid}`] ??= { alloc: {} };
      if (d.process_totals) P.footprintMB = MB(parseInt(d.process_totals.private_footprint_bytes ?? '0', 16));
      for (const [name, a] of Object.entries(d.allocators ?? {})) {
        const v = a.attrs?.size?.value ? MB(parseInt(a.attrs.size.value, 16)) : 0, depth = name.split('/').length;
        if (v >= 0.5 && (depth === 1 || /^(cc\/image_memory|gpu\/shared_images|gpu\/transfer_memory|skia\/gpu_resources|v8\/(main|workers)\/heap|partition_alloc\/partitions\/(array_buffer|buffer)|malloc\/allocated_objects)$/.test(name))) P.alloc[name] = v;
      }
    }
    return byPid;
  };
  const sample = async name => {
    await pcdp.send('HeapProfiler.collectGarbage').catch(() => {}); await sleep(1500);
    const m = Object.fromEntries((await pcdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    const pinfo = (await bcdp.send('SystemInfo.getProcessInfo')).processInfo, types = Object.fromEntries(pinfo.map(p => [p.id, p.type])), ids = pinfo.map(p => p.id).join(',');
    const procs = JSON.parse(ps(`$ids=@(${ids}); @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" | Where-Object { $ids -contains $_.ProcessId } | Select-Object ProcessId,WorkingSetSize,PrivatePageCount,@{n='t';e={ if ($_.CommandLine -match '--type=([a-z-]+)') { $matches[1] } else { 'browser' } }}) | ConvertTo-Json -Compress`) || '[]');
    const vram = {}; for (const line of ps(`$ids=@(${ids}); (Get-Counter '\\GPU Process Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue).CounterSamples | Where-Object { $_.InstanceName -match '^pid_(\\d+)_' -and $ids -contains [int]$matches[1] } | ForEach-Object { "$($matches[1])|$($_.CookedValue)" }`).split(/\r?\n/).filter(Boolean)) { const [pid, v] = line.split('|'); vram[pid] = (vram[pid] ?? 0) + MB(+v); }
    const list = (Array.isArray(procs) ? procs : [procs]).map(p => ({ pid: p.ProcessId, type: p.t, privMB: MB(p.PrivatePageCount), wsMB: MB(p.WorkingSetSize), vramMB: vram[p.ProcessId] ?? 0 }));
    const sum = t => Math.round(list.filter(p => t(p.type)).reduce((a, p) => a + p.privMB, 0)), renderer = Math.max(0, ...list.filter(p => p.type === 'renderer').map(p => p.privMB));
    const game = await page.evaluate(() => { const g = window.__game, a = g.gl.atlas?.plan, gr = g.ground; return { workers: null, atlasMB: a ? a.bytes / 1048576 : 0, atlasPages: a?.pages ?? 0, groundWorkers: gr.workers.length, groundMB: gr.residentPx * 4 / 1048576, bakeMs: gr.baked ? gr.bakeMs / gr.baked : 0, lotProps: g.perf.lotProps, atlasSoft: g.perf.atlasSoft }; });
    game.workers = page.workers().map(w => w.url().replace(/^.*\//, '').replace(/\?.*$/, ''));
    const s = { name, t: (Date.now() - t0) / 1000, mainHeapMB: MB(m.JSHeapUsedSize), rendererMB: renderer, gpuMB: sum(t => t === 'gpu-process'), browserMB: sum(t => t === 'browser'), totalMB: sum(() => true), vramMB: Math.round(list.reduce((a, p) => a + p.vramMB, 0)), procs: list, game, infra: await infra(types).catch(e => ({ error: String(e) })) };
    out.samples.push(s);
    console.log(`${label} / ${name}: renderer ${s.rendererMB} MB + GPU process ${s.gpuMB} MB = ${Math.round(s.rendererMB + s.gpuMB)} MB private; VRAM ${s.vramMB} MB; all Edge processes ${s.totalMB} MB; main JS heap ${s.mainHeapMB} MB`);
    console.log(`  workers ${game.workers.length} (${game.workers.join(', ')}); atlas ${game.atlasMB.toFixed(0)} MB of ${game.atlasPages} pages; ground ${game.groundMB.toFixed(0)} MB, ${game.groundWorkers} ground workers, bake ${game.bakeMs.toFixed(0)} ms`);
    const r = Object.entries(s.infra).filter(([k]) => k.startsWith('renderer')).sort((a, b) => (b[1].footprintMB ?? 0) - (a[1].footprintMB ?? 0))[0]?.[1];
    if (r) console.log('  renderer allocators: ' + Object.entries(r.alloc).filter(([, v]) => v >= 5).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, v]) => `${n} ${v}`).join(', '));
  };
  await settle(idle); await sample('idle');
  if (gens) {
    for (let k = 0; k < gens; k++) { if (!(await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim().startsWith('Generate')); b?.click(); return !!b; }))) break; await sleep(2500); }
    await settle(10); await sample(`after ${gens} Generate`);
  }
} finally {
  await browser.close();
  fs.mkdirSync('output/memory', { recursive: true }); fs.writeFileSync(`output/memory/mem-${label}.json`, JSON.stringify(out, null, 1));
}

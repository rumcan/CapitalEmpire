// What a page of the game costs in memory (T157): one headless Edge, one page, then after an idle wait and a forced GC
//   - the Chromium memory-infra dump per process (allocators: worker canvases, decoded images, ArrayBuffers, V8 heaps, GPU shared images),
//   - each Edge process's private bytes and working set (SystemInfo.getProcessInfo + Win32_Process),
//   - each one's VRAM from Windows' "GPU Process Memory" counters,
//   - the engine's own numbers (__game: the atlas plan, the ground cache, the workers).
// The lot lab used about 4.2 GB of renderer + GPU memory on the full boot and about 1.3 GB on the light one (issue #336). Windows only (the
// process list and the GPU counters come from PowerShell). Run one at a time on this PC: the browser takes 1.5-6 GB while it measures.
//   node scripts/perf/memory.mjs <url> <label> [--idle 25] [--generate 3] [--pan 30] [--seed 1] [--warm] [--dpr 1.25] [--w 1600] [--h 900] [--channel msedge]
//   e.g. node scripts/perf/memory.mjs "http://localhost:5188/?lotlab&dev" lab --generate 3
// --generate N clicks the lot lab's Generate N times and measures again. Writes output/memory/mem-<label>.json and prints a summary.
// T166 (#370): --pan S pans the camera round a circle for S seconds and measures again; --seed N makes Math.random seeded (the same town each
// run); --warm loads the page once, waits for the texture pack to be written to the browser's cache, and measures a second page (the cache
// read). Each sample also gives the chunk bakes since the last one (worker ms: median and p95) and, for the first, the load's times: the
// game ready, the builder's textures ready, the first chunk and the first view fully baked.
// T168 (#381): each bake's wait too (from its request to its picture landing: a stall in the worker shows there), the textures the worker made
// on first use (its log), and --course: a water pond and a bunker laid by the course grid beside the view (the Course tool's paint), measured.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2), url = args[0], label = args[1] ?? 'page';
if (!url) { console.error('usage: node scripts/perf/memory.mjs <url> <label> [--idle s] [--generate n] [--dpr d]'); process.exit(2); }
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const gens = +opt('generate', '0'), idle = +opt('idle', '25'), dpr = +opt('dpr', '1.25'), W = +opt('w', '1600'), H = +opt('h', '900');
const pan = +opt('pan', '0'), jumps = +opt('jumps', '0'), seed = opt('seed', null), warm = args.includes('--warm'), coursePaint = args.includes('--course');
const MB = b => Math.round(b / 1048576 * 10) / 10, sleep = ms => new Promise(r => setTimeout(r, ms));
const ps = cmd => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });

const browser = await chromium.launch({ channel: opt('channel', 'msedge'), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader=false', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const out = { url, label, dpr, viewport: [W, H], when: new Date().toISOString(), samples: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
  if (seed != null) await ctx.addInitScript(s0 => { let s = s0 >>> 0; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }, +seed);
  if (warm) {
    // the first visit builds the texture pack and writes it to this context's IndexedDB; the measured page then reads it
    const p0 = await ctx.newPage();
    await p0.goto(url, { waitUntil: 'load', timeout: 120000 });
    await p0.waitForFunction(() => window.__game && window.__game.ready && window.__game.ground.ready >= window.__game.ground.workers.length && !window.__game.ground.saving.some(Boolean), null, { timeout: 240000, polling: 500 });
    await sleep(3000); await p0.close(); out.warm = true;
  }
  const page = await ctx.newPage(), bcdp = await browser.newBrowserCDPSession(), pcdp = await ctx.newCDPSession(page);
  await pcdp.send('Performance.enable');
  const made = []; page.on('console', m => { const q = /\[ground worker (\d+)\] made (\S+) in (\d+) ms/.exec(m.text()); if (q) made.push({ t: (Date.now() - t0) / 1000, w: +q[1], what: q[2], ms: +q[3] }); });
  out.made = made;
  // T172: the ground workers' pixels by owner, asked for at each sample (a `mem {...}` log line per worker)
  const memLines = []; page.on('console', m => { const q = /\[ground worker (\d+)\] mem (\{.*\})/.exec(m.text()); if (q) memLines.push({ w: +q[1], parts: JSON.parse(q[2]) }); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000, polling: 100 });
  // the load's times (s since the navigation): the game ready, the first chunk, the first view fully baked; the builder's textures (ms)
  const load = { readyS: (Date.now() - t0) / 1000 };
  for (let k = 0; k < 600; k++) { const f = await page.evaluate(() => window.__game.ground.firstTileAt); if (f) { load.firstChunkS = f / 1000; break; } await sleep(100); }
  for (let k = 0; k < 900; k++) { if (!(await page.evaluate(() => { const g = window.__game.ground; return g.want.length + g.inflight.reduce((a, b) => a + b, 0); }))) break; await sleep(100); }
  load.viewS = await page.evaluate(() => performance.now() / 1000); load.texMs = await page.evaluate(() => Math.round(window.__game.ground.texMs));
  out.load = load; console.log(`${label} / load: ready ${load.readyS.toFixed(1)} s, textures ${load.texMs} ms, first chunk ${load.firstChunkS?.toFixed(1)} s, first view baked ${load.viewS.toFixed(1)} s`);
  /** the bakes since the last sample: count, worker ms median and p95 */
  let bakedAt = 0;
  const bakes = async () => {
    const { log, wlog, n } = await page.evaluate(() => ({ log: window.__game.ground.bakeLog, wlog: window.__game.ground.waitLog ?? [], n: window.__game.ground.baked }));
    const ms = [], wait = []; for (let i = Math.max(bakedAt, n - log.length); i < n; i++) { ms.push(log[i % log.length]); if (wlog.length) wait.push(wlog[i % wlog.length]); }
    bakedAt = n; ms.sort((a, b) => a - b); wait.sort((a, b) => a - b);
    const q = (a, f) => (a.length ? +a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(1) : null);
    return { n: ms.length, medianMs: q(ms, 0.5), p95Ms: q(ms, 0.95), maxMs: ms.length ? +ms[ms.length - 1].toFixed(1) : null, waitMedianMs: q(wait, 0.5), waitP95Ms: q(wait, 0.95), waitMaxMs: wait.length ? +wait[wait.length - 1].toFixed(1) : null };
  };
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
    const s = { name, t: (Date.now() - t0) / 1000, mainHeapMB: MB(m.JSHeapUsedSize), rendererMB: renderer, gpuMB: sum(t => t === 'gpu-process'), browserMB: sum(t => t === 'browser'), totalMB: sum(() => true), vramMB: Math.round(list.reduce((a, p) => a + p.vramMB, 0)), bakes: await bakes(), procs: list, game, infra: await infra(types).catch(e => ({ error: String(e) })) };
    out.samples.push(s);
    console.log(`${label} / ${name}: renderer ${s.rendererMB} MB + GPU process ${s.gpuMB} MB = ${Math.round(s.rendererMB + s.gpuMB)} MB private; VRAM ${s.vramMB} MB; all Edge processes ${s.totalMB} MB; main JS heap ${s.mainHeapMB} MB`);
    console.log(`  workers ${game.workers.length} (${game.workers.join(', ')}); atlas ${game.atlasMB.toFixed(0)} MB of ${game.atlasPages} pages; ground ${game.groundMB.toFixed(0)} MB, ${game.groundWorkers} ground workers, bake ${game.bakeMs.toFixed(0)} ms`);
    console.log(`  bakes since the last sample: ${s.bakes.n}, worker ms median ${s.bakes.medianMs}, p95 ${s.bakes.p95Ms}, max ${s.bakes.maxMs}; wait (request to picture) median ${s.bakes.waitMedianMs}, p95 ${s.bakes.waitP95Ms}, max ${s.bakes.waitMaxMs}; browser process ${s.browserMB} MB`);
    const newly = made.filter(x => !x.shown); for (const x of newly) x.shown = true;
    if (newly.length) console.log('  made on first use: ' + newly.map(x => `${x.what} ${x.ms} ms @${x.t.toFixed(1)}s`).join(', '));
    const w = Object.entries(s.infra).filter(([k]) => k.startsWith('renderer')).map(([, v]) => v.alloc['v8/workers/heap']).filter(Boolean);
    if (w.length) console.log(`  worker V8 heaps ${w.join(', ')} MB`);
    const r = Object.entries(s.infra).filter(([k]) => k.startsWith('renderer')).sort((a, b) => (b[1].footprintMB ?? 0) - (a[1].footprintMB ?? 0))[0]?.[1];
    if (r) console.log('  renderer allocators: ' + Object.entries(r.alloc).filter(([, v]) => v >= 5).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, v]) => `${n} ${v}`).join(', '));
    const gp = Object.entries(s.infra).find(([k]) => k.startsWith('GPU'))?.[1];
    if (gp) console.log('  GPU process allocators: ' + Object.entries(gp.alloc).filter(([, v]) => v >= 5).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, v]) => `${n} ${v}`).join(', '));
    // T172: the ground workers' pixels by owner (MB of RGBA8)
    memLines.length = 0; await page.evaluate(() => window.__game.ground.broadcast({ t: 'memProbe' })).catch(() => {});
    for (let k = 0; k < 20 && memLines.length < (game.groundWorkers || 1); k++) await sleep(100);
    s.groundPixels = memLines.map(l => l.parts);
    for (const l of memLines) { const tot = Object.values(l.parts).reduce((a, b) => a + b, 0); console.log(`  ground worker ${l.w} pixels ${tot.toFixed(0)} MB: ` + Object.entries(l.parts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')); }
  };
  await settle(idle); await sample('idle');
  /** T172: the sprite atlas's pop-in: the cells wanted on screen this frame still short of the level they want (drawn blurrier until it
   *  lands), and its decodes and loads so far */
  const atlasNow = () => page.evaluate(() => {
    const a = window.__game.gl.atlas; if (!a) return null; const P = a.pages; let waiting = 0;
    for (const tier of P.slots) for (const s of tier) if (s.unit >= 0 && s.weight >= 1e9 && s.have > s.target && s.used >= a.frame - 2) waiting++;
    return { waiting, decodes: a.stats.decodes, loads: P.stats.loads };
  }).catch(() => null);
  if (pan) {
    // round a circle of 120 tiles about the view's centre at its zoom, one step every 50 ms, so new chunks keep being baked
    const c = await page.evaluate(() => { const g = window.__game, X = g.cam.X, Y = g.cam.Y; return { x: (X / 64 + Y / 32) / 2, y: (Y / 32 - X / 64) / 2, z: g.cam.z }; });
    const steps = Math.round(pan * 20), a0 = await atlasNow(), waits = [];
    for (let k = 0; k <= steps; k++) { const a = (2 * Math.PI * k) / steps; await page.evaluate(([x, y, z]) => window.__game.lookAt(x, y, z), [c.x + 120 * Math.sin(a), c.y + 120 * (1 - Math.cos(a)), c.z]); await sleep(50); if (k % 4 === 0) { const w = await atlasNow(); if (w) waits.push(w.waiting); } }
    const a1 = await atlasNow();
    if (a0 && a1) { const mean = waits.reduce((x, y) => x + y, 0) / Math.max(1, waits.length); out.atlasPan = { meanWaiting: +mean.toFixed(1), maxWaiting: Math.max(0, ...waits), decodes: a1.decodes - a0.decodes, loads: a1.loads - a0.loads };
      console.log(`${label} / atlas during the pan: cells waiting for their level mean ${out.atlasPan.meanWaiting}, max ${out.atlasPan.maxWaiting}; ${out.atlasPan.decodes} decodes, ${out.atlasPan.loads} loads`); }
    await settle(5); await sample(`after a ${pan} s pan`);
  }
  if (coursePaint) {
    // the Course tool's paint, as its result reaches the ground: a course grid round the view with a water pond and a bunker in it
    await page.evaluate(async () => {
      const g = window.__game, X = g.cam.X, Y = g.cam.Y, cx = (X / 64 + Y / 32) / 2, cy = (Y / 32 - X / 64) / 2;
      const CG = await import('/src/game/ext/course-grid/index.ts'), AR = await import('/src/game/ext/course-grid/areas.ts');
      const blob = (x, y, r) => { const o = []; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; o.push(x + r * Math.cos(a), y + r * Math.sin(a) * 0.7); } return o; };
      const grid = CG.makeGrid(Math.floor(cx - 60), Math.floor(cy - 60), 240, 240);
      AR.rasterAreas(grid, [{ pts: blob(cx - 12, cy, 10), surface: 'water', month: 0 }, { pts: blob(cx + 14, cy + 4, 6), surface: 'bunker', month: 0 }]);
      g.courseGrid = grid; g.resendCourse();
    });
    await settle(8); await sample('after painting water and a bunker');
  }
  if (jumps) {
    // the ground's fill time after a jump to somewhere new (the bake throughput: a whole view of new chunks), at the closest zoom and at 8%
    const fills = [];
    for (let k = 0; k < jumps; k++) for (const z of [0.3, 0.08]) {
      const x = 400 + ((k * 397 + (z > 0.1 ? 0 : 211)) % 1248), y = 400 + ((k * 631 + (z > 0.1 ? 97 : 0)) % 1248);
      await page.evaluate(([x, y, z]) => window.__game.lookAt(x, y, z), [x, y, z]);
      const t = Date.now(); await sleep(150); let sharp = null;
      for (let q = 0; q < 600; q++) {
        const w = await atlasNow(); if (sharp === null && w && !w.waiting) sharp = (Date.now() - t) / 1000;
        if (!(await page.evaluate(() => { const g = window.__game.ground; return g.want.length + g.inflight.reduce((a, b) => a + b, 0); }))) break; await sleep(50);
      }
      for (let q = 0; sharp === null && q < 100; q++) { const w = await atlasNow(); if (!w || !w.waiting) sharp = (Date.now() - t) / 1000; else await sleep(50); }
      fills.push({ z, s: (Date.now() - t) / 1000, sharp });
    }
    const f = z => fills.filter(q => q.z === z).map(q => q.s).sort((a, b) => a - b), med = a => a[Math.floor(a.length / 2)];
    out.jumps = fills; console.log(`${label} / jumps: view filled at 30% median ${med(f(0.3))} s (max ${Math.max(...f(0.3))}), at 8% median ${med(f(0.08))} s (max ${Math.max(...f(0.08))})`);
    const sh = z => fills.filter(q => q.z === z).map(q => q.sharp ?? 9).sort((a, b) => a - b);
    console.log(`${label} / jumps: sprites at their level at 30% median ${med(sh(0.3))} s (max ${Math.max(...sh(0.3))}), at 8% median ${med(sh(0.08))} s (max ${Math.max(...sh(0.08))})`);
    await sample(`after ${jumps} x 2 jumps`);
  }
  if (gens) {
    for (let k = 0; k < gens; k++) { if (!(await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim().startsWith('Generate')); b?.click(); return !!b; }))) break; await sleep(2500); }
    await settle(10); await sample(`after ${gens} Generate`);
  }
} finally {
  await browser.close();
  fs.mkdirSync('output/memory', { recursive: true }); fs.writeFileSync(`output/memory/mem-${label}.json`, JSON.stringify(out, null, 1));
}

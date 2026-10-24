// Runs the in-game benchmark (?bench) in a headless browser on the real GPU and prints the results.
//   node scripts/perf/bench.mjs [url] [--size 1] [--dpr 1] [--shots] [--channel msedge|chrome] [--serve] [--course] [--courseSend ms]
// --serve starts `vite preview` on dist/ itself (run `npm run build` first); otherwise it needs a running dev or
// preview server at the url. Screenshots (--shots stalls frames, so only for looking) and JSON go to output/bench/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
let base = args.find(a => a.startsWith('http')) || 'http://[::1]:5174/'; // vite binds localhost, which is IPv6 here
let server = null;
if (args.includes('--serve')) {
  base = 'http://127.0.0.1:5199/';
  server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', '5199', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', shell: process.platform === 'win32' });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 500)); }
}
const size = opt('size', '1'), dpr = +opt('dpr', '1'), shots = args.includes('--shots');
const out = path.resolve('output/bench'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
let browser, page, gpu = 'unknown';
// headless Chrome on the worker sometimes starts without WebGL (GPU unknown): relaunch instead of waiting for nothing
for (let attempt = 0; attempt < 3 && gpu === 'unknown'; attempt++) {
if (browser) { console.log('[bench] no WebGL, relaunching the browser'); await browser.close(); }
browser = await chromium.launch({ channel: opt('channel', 'msedge'), headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader=false', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: dpr });
const logs = [];
page.on('console', m => { const t = m.text(); if (/\[bench\]|error|Error/.test(t)) { logs.push(t); console.log('[page]', t.slice(0, 300)); } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('crash', () => console.log('[crash] the page crashed'));
await page.goto(`${base}?bench=${size}${args.includes("--course") ? "&course=1" : ""}${opt("courseSend", "") ? "&courseSend=" + opt("courseSend", "") : ""}${opt("courseHold", "") ? "&courseHold=" + opt("courseHold", "") : ""}`); // --course: the old nine laid as a course grid under the tour (T077)
gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl?.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
}
console.log('GPU:', gpu);
let shot = 0;
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const r = await page.evaluate(() => ({ done: !!window.__bench, ready: !!window.__game?.ready, tier: window.__game?.perf.tier, z: window.__game?.cam.z })).catch(() => null);
  if (!r) break;
  if (shots && r.ready && Date.now() - t0 > 2000 * (shot + 1)) { await page.screenshot({ path: path.join(out, `tour-${String(shot).padStart(2, '0')}-${r.tier}-${(r.z * 100).toFixed(1)}.png`) }); shot++; }
  if (r.done) break;
  if (!r.ready && Date.now() - t0 > 5000 * (Math.floor((Date.now() - t0) / 5000))) { const h = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576)).catch(() => -1); console.log('[wait] heap', h, 'MB'); }
  await new Promise(res => setTimeout(res, 500));
}
const res = await page.evaluate(() => window.__bench).catch(() => null);
console.log(JSON.stringify({ gpu, ...res }, null, 1));
fs.writeFileSync(path.join(out, `bench-size${size}-dpr${dpr}.json`), JSON.stringify({ gpu, ...res }, null, 1));
await browser.close();
if (server) { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']); else server.kill(); }

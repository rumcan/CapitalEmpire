// npm run cinder:bench (T438, docs/CINDERLINKS-PORT.md): the view's four speed budgets, as far as they can be measured headless.
//   (a) the view's frame: the Cinderlinks harness's own render timings on the built page (Woodhill handed over as the host does, at the page's
//       0.75 picture scale): the tee, forty of the host's people, the game tick; a frame rate from their sum (budget 60 fps: 16.7 ms)
//   (b) the manager view's cost a frame while the panel is open: browser only (budget under 2 ms; the numbers are in docs/CINDERLINKS-PORT.md)
//   (c) the course export: scripts/cinder/bench-export.ts, Woodhill and a painted 18 holes (budget under 300 ms)
//   (d) Play this hole to the first picture: headless, the export plus the view's course load and first picture (budget under 3 s); the page's
//       own load (fetching and starting game.js) is measured in the browser only
// Needs `npm run cinder:build` first (public/cinderlinks/game.js). Prints the four lines and one JSON line; exit 1 when a measured one is over budget.
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'output', 'cinder-bench');
const BUDGET = { frameMs: 1000 / 60, managerMs: 2, exportMs: 300, firstPictureMs: 3000 };
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, shell: false, maxBuffer: 64 << 20 });
  if (r.status !== 0 && !r.stdout) { process.stderr.write(r.stderr || ''); throw new Error(cmd + ' ' + args.join(' ') + ' failed'); }
  return r.stdout;
};
const lastJson = (s) => JSON.parse(s.trim().split('\n').filter((l) => l.startsWith('{')).pop());

// (c) the export
fs.mkdirSync(OUT, { recursive: true });
const esbuild = path.join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild');
run(process.execPath, [esbuild, 'scripts/cinder/bench-export.ts', '--bundle', '--platform=node', '--format=esm', '--outfile=' + path.join(OUT, 'export.mjs'), '--log-level=warning']);
const ex = lastJson(run(process.execPath, [path.join(OUT, 'export.mjs')]));

// (a), (d): the harness on the built page
const game = path.join(ROOT, 'public', 'cinderlinks', 'game.js');
if (!fs.existsSync(game)) throw new Error('no ' + game + ': run npm run cinder:build first');
const h = lastJson(run(process.execPath, [path.join(ROOT, 'packages', 'cinderlinks', 'harness.mjs'), game], { RSCALE: process.env.RSCALE || '0.75' }));
const teeMs = h.host?.renderMs ?? h.renderStandMs, frameMs = teeMs + (h.actors40Ms ?? 0) + (h.tickMs ?? 0);
const exportMs = Math.max(ex.woodhill.medianMs, ex.painted.medianMs), firstMs = ex.woodhill.firstMs + (h.hostLoadMs ?? 0);

const ok = (v, b) => (v <= b ? 'ok' : 'OVER');
const lines = [
  `(a) view frame, Woodhill tee + 40 people + tick: ${frameMs.toFixed(1)} ms = ${Math.min(60, 1000 / frameMs).toFixed(0)} fps (budget 60 fps) ${ok(frameMs, BUDGET.frameMs)}` +
    `   [tee ${teeMs} ms, forty people ${h.actors40Ms} ms, tick ${h.tickMs} ms; walking ${h.renderWalkMs} ms (max ${h.renderWalkMaxMs}), flight ${h.renderFlightMs} ms (max ${h.renderFlightMaxMs})]`,
  `(b) manager view a frame with the panel open: browser only (budget under ${BUDGET.managerMs} ms; see docs/CINDERLINKS-PORT.md T438)`,
  `(c) course export: Woodhill ${ex.woodhill.medianMs} ms (first ${ex.woodhill.firstMs}), painted 18 ${ex.painted.medianMs} ms (first ${ex.painted.firstMs}) (budget ${BUDGET.exportMs} ms) ${ok(exportMs, BUDGET.exportMs)}` +
    `   [Woodhill: file ${ex.woodhill.exportMs}, entry ${ex.woodhill.entryMs}, lies ${ex.woodhill.liesMs} ms]`,
  `(d) Play this hole to the first picture, headless part: ${firstMs.toFixed(0)} ms (export ${ex.woodhill.firstMs} + the view's course load and first picture ${h.hostLoadMs}) (budget ${BUDGET.firstPictureMs} ms) ${ok(firstMs, BUDGET.firstPictureMs)}`,
];
console.log(lines.join('\n'));
const over = frameMs > BUDGET.frameMs || exportMs > BUDGET.exportMs || firstMs > BUDGET.firstPictureMs;
console.log(JSON.stringify({ frameMs: +frameMs.toFixed(2), fps: +Math.min(60, 1000 / frameMs).toFixed(1), managerMs: null, export: ex, firstPictureMs: Math.round(firstMs), harness: { host: h.host, actors40Ms: h.actors40Ms, tickMs: h.tickMs, hostLoadMs: h.hostLoadMs }, over }));
process.exit(over ? 1 : 0);

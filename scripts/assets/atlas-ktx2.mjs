// T080: the sprite atlas pages as KTX2 (Basis UASTC 4x4, Zstandard-supercompressed), for the production build. The game transcodes them at
// load to the GPU's own block format (BC7 on desktops, ASTC or ETC2 on phones; atlas-ktx2.ts), a quarter of the RGBA8 memory.
//
// vite.config.ts atlasKtx2() calls encodeAtlasPages() in the build: every atlas page level the game loads (library.ts ATLAS_PAGES, read by
// bundling it with esbuild) is encoded once and cached by the sha256 of its WebP, so the KTX2 is never stale and nothing extra is committed.
// The cache is shared by every worktree of the clone (<git common dir>/atlas-ktx2-cache; ATLAS_KTX2_CACHE overrides it). A cold cache costs
// about 90 s (245 page levels in 3 worker threads, about 200 MB each), a warm one about 10 s. The dev server uses the WebP pages directly.
//
// The colour is premultiplied by alpha before encoding (the game blends premultiplied; a block format cannot be premultiplied at upload).
// Run by hand to warm the cache or to measure: node scripts/assets/atlas-ktx2.mjs [--quality] [--prune] (sizes and times; --quality: the
// UASTC round-trip PSNR of every mip 0; --prune: delete the cached files the current pages no longer use).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** bump when the encoding changes: the cache key includes it */
export const KTX2_VERSION = 'uastc1-zstd-premul-v1';

/** the cache folder: ATLAS_KTX2_CACHE, else <git common dir>/atlas-ktx2-cache (shared by the worktrees), else node_modules/.cache */
export function cacheDir(root = ROOT) {
  if (process.env.ATLAS_KTX2_CACHE) return path.resolve(process.env.ATLAS_KTX2_CACHE);
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  const common = r.status === 0 ? r.stdout.trim() : '';
  return common ? path.join(path.resolve(root, common), 'atlas-ktx2-cache') : path.join(root, 'node_modules', '.cache', 'atlas-ktx2');
}

/** the source file of every atlas page level, [page][mip] (repo-relative, forward slashes), in library.ts ATLAS_PAGES order */
export async function atlasPageSources(root = ROOT) {
  const esbuild = await import('esbuild');
  const out = path.join(root, 'node_modules', '.cache', 'atlas-ktx2', 'pages.mjs');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await esbuild.build({
    stdin: { contents: "export { ATLAS_PAGES } from './src/game/library';", resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error',
    plugins: [{ name: 'asset-paths', setup(b) { b.onLoad({ filter: /\.(webp|png)$/ }, a => ({ contents: `export default ${JSON.stringify(path.relative(root, a.path).replaceAll('\\', '/'))};`, loader: 'js' })); } }],
  });
  const { ATLAS_PAGES } = await import(pathToFileURL(out).href + '?t=' + Date.now());
  return ATLAS_PAGES;
}

const sha = buf => crypto.createHash('sha256').update(buf).update(KTX2_VERSION).digest('hex');

/** Encode WebP page levels to KTX2 (cached). items: { key, source: Buffer }; returns Map key -> KTX2 Buffer. Encodes run in worker threads. */
export async function encodeAtlasPages(items, o = {}) {
  const dir = o.cacheDir ?? cacheDir(), log = o.log ?? (() => {}), out = new Map(), todo = [];
  fs.mkdirSync(dir, { recursive: true });
  for (const it of items) {
    const file = path.join(dir, sha(it.source) + '.ktx2');
    if (fs.existsSync(file)) out.set(it.key, fs.readFileSync(file)); else todo.push({ ...it, file });
  }
  if (!todo.length) return out;
  // the biggest first, so the threads finish together; each encode of a 2048 px level holds about 200 MB in its thread
  todo.sort((a, b) => b.source.length - a.source.length);
  const threads = Math.max(1, Math.min(o.threads ?? Math.min(3, os.cpus().length - 1), todo.length));
  log(`atlas KTX2: encoding ${todo.length} of ${items.length} page levels in ${threads} threads (cache ${dir})`);
  const t0 = Date.now(); let next = 0, done = 0;
  const run = () => new Promise((resolve, reject) => {
    const w = new Worker(new URL('./atlas-ktx2-worker.mjs', import.meta.url));
    const feed = () => {
      if (next >= todo.length) { void w.terminate(); resolve(); return; }
      const it = todo[next++]; w.once('message', m => {
        if (m.error) { void w.terminate(); reject(new Error(`${it.key}: ${m.error}`)); return; }
        const buf = Buffer.from(m.ktx2); fs.writeFileSync(it.file + '.tmp', buf); fs.renameSync(it.file + '.tmp', it.file); out.set(it.key, buf);
        if (++done % 20 === 0) log(`atlas KTX2: ${done} / ${todo.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
        feed();
      });
      w.postMessage({ webp: it.source });
    };
    w.once('error', reject); feed();
  });
  await Promise.all(Array.from({ length: threads }, run));
  log(`atlas KTX2: encoded ${todo.length} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return out;
}

// ---- by hand: warm the cache, print the sizes (and with --quality the UASTC round-trip PSNR against the premultiplied WebP)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pages = await atlasPageSources();
  const items = pages.flatMap((row, p) => row.map((src, m) => ({ key: `${p}/${m}`, src, source: fs.readFileSync(path.join(ROOT, src)) })));
  const t0 = Date.now(), res = await encodeAtlasPages(items, { log: console.log });
  let webp = 0, ktx2 = 0; for (const it of items) { webp += it.source.length; ktx2 += res.get(it.key).length; }
  console.log(`${pages.length} pages, ${items.length} levels: WebP ${(webp / 1048576).toFixed(1)} MB -> KTX2 ${(ktx2 / 1048576).toFixed(1)} MB (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (process.argv.includes('--prune')) {
    const keep = new Set(items.map(it => sha(it.source) + '.ktx2')), dir = cacheDir(); let n = 0;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.ktx2') && !keep.has(f)) { fs.unlinkSync(path.join(dir, f)); n++; }
    console.log(`pruned ${n} cached files no page uses`);
  }
  if (process.argv.includes('--quality')) {
    const { worstPsnr } = await import('./atlas-ktx2-worker.mjs');
    const report = await worstPsnr(items.filter(it => it.key.endsWith('/0')).map(it => ({ key: it.src, webp: it.source, ktx2: res.get(it.key) })));
    for (const r of report) console.log(`${r.key}: PSNR ${r.psnr.toFixed(1)} dB (RGBA premultiplied, non-transparent texels), max channel error ${r.maxErr}`);
  }
}

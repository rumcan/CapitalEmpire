// T357 (#999): the real ground height under a stage-1 course (scripts/dev/osm-course.mjs --height runs this too): the AWS Terrain Tiles ("terrarium" PNGs)
// over the course, sampled at 4 m, smoothed, packed, with a hillshade preview. Plain Node 22; the sampling, smoothing and packing are the game's own
// (src/game/golf/osm/terrarium.ts, bundled here with esbuild), so a fixture's height and an in-game import are made the same way.
//   node scripts/dev/osm-height.mjs <slug | path/to/stage-1.json> [--margin 520] [--sigma 15] [--z 15] [--out E:/ClaudeTemp/T340] [--refresh]
// Writes <out>/<slug>.height.json (the 4 m smoothed grid packed, with its source and credit) and <out>/<slug>-height.png (the hillshade, the sun at the
// upper right of the game's screen, which is the north on a north-up map, with the hole lines in white). scripts/dev/osm-trim-fixture.mjs reads the .height.json
// next to its input, crops it and writes the fixture's `height` (the pack at the step the source's resolution needs).
// The tiles are public (https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png: free, no key). Politely: a descriptive User-Agent, one
// request at a time with a pause, each tile cached for good in <out>/dem/raw/<z>-<x>-<y>.png with its imagery source beside it (.meta), so a rerun makes no
// request. DATA: SRTM and 3DEP are the U.S. Geological Survey's (public domain, credit requested); Tilezen's attribution list is in terrarium.ts.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const UA = 'CapitalEmpire-dev-script/0.1 (+https://github.com/rumcan/CapitalEmpire; golf course ground height)';
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** the game's terrarium.ts, bundled for Node */
export async function loadTerrarium() {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [`${ROOT}/src/game/golf/osm/terrarium.ts`], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error' });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
}

/** the tiles of a window: from the cache, else fetched (one at a time, 300 ms apart) and cached with their imagery source. Returns the decoded tiles and the sources seen */
export async function fetchTiles(T, keys, { rawDir, refresh = false, quiet = false }) {
  mkdirSync(rawDir, { recursive: true });
  const tiles = new Map(), sources = new Set();
  let fetched = 0;
  for (const k of keys) {
    const base = `${rawDir}/${k.z}-${k.x}-${k.y}`, png = `${base}.png`, meta = `${base}.png.meta`;
    let bytes, src;
    if (!refresh && existsSync(png)) {
      bytes = new Uint8Array(readFileSync(png));
      if (existsSync(meta)) src = JSON.parse(readFileSync(meta, 'utf8')).sources;
      else { // a tile cached before the sidecar existed: one HEAD for its imagery source
        const h = await fetch(T.demTileUrl(k.z, k.x, k.y), { method: 'HEAD', headers: { 'User-Agent': UA } });
        src = h.headers.get('x-amz-meta-x-imagery-sources') ?? '';
        writeFileSync(meta, JSON.stringify({ sources: src, fetchedAt: null, bytes: bytes.length, note: 'source read from a HEAD request; the tile was cached earlier' }));
        await sleep(300);
      }
    } else {
      const url = T.demTileUrl(k.z, k.x, k.y);
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
      src = res.headers.get('x-amz-meta-x-imagery-sources') ?? '';
      writeFileSync(png, bytes);
      writeFileSync(meta, JSON.stringify({ sources: src, fetchedAt: new Date().toISOString(), bytes: bytes.length }));
      fetched++;
      if (!quiet) log(`  fetched ${k.z}/${k.x}/${k.y}: ${bytes.length} bytes, imagery ${src || '(none given)'}`);
      await sleep(300);
    }
    tiles.set(T.tileText(k), await T.decodeTile(bytes));
    if (src) for (const s of src.split(',')) sources.add(s.trim());
  }
  return { tiles, sources: [...sources], fetched };
}

/** the hillshade of a grid (sun toward the north, slightly west: the game's SUN_TILE_DIR on a north-up map) as RGB with the hole lines drawn white */
export function shadePng(grid, holes, scale = 1) {
  const { w, h, m, step } = grid;
  let lo = Infinity, hi = -Infinity; for (const v of m) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const rgb = Buffer.alloc(w * h * 3), L = Math.hypot(-0.16, 1, 1.05), lx = -0.16 / L, ly = 1 / L, lz = 1.05 / L; // (x east, y north)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const g = (di, dj) => m[Math.min(h - 1, Math.max(0, j + dj)) * w + Math.min(w - 1, Math.max(0, i + di))];
    const gx = (g(1, 0) - g(-1, 0)) / (2 * step), gy = -(g(0, 1) - g(0, -1)) / (2 * step); // (y north: rows run south)
    const nx = -gx * 3, ny = -gy * 3, nl = Math.hypot(nx, ny, 1), sh = Math.max(0, (nx * lx + ny * ly + lz) / nl) / lz; // 1 on flat ground
    const t = (m[j * w + i] - lo) / (hi - lo || 1), k = Math.min(1.6, 0.35 + 0.65 * sh) , o = (j * w + i) * 3;
    rgb[o] = Math.min(255, Math.round((70 + 140 * t) * k)); rgb[o + 1] = Math.min(255, Math.round((120 + 90 * (1 - t)) * k)); rgb[o + 2] = Math.min(255, Math.round(80 * k));
  }
  for (const hl of holes) {
    const Ls = hl.line; if (!Ls) continue;
    for (let s = 1; s < Ls.length; s++) {
      const [ax, ay] = Ls[s - 1], [bx, by] = Ls[s], n = Math.ceil(Math.hypot(bx - ax, by - ay) / step) + 1;
      for (let q = 0; q <= n; q++) {
        const x = ax + (bx - ax) * q / n, y = ay + (by - ay) * q / n, i = Math.round((x - grid.x0) / step), j = Math.round((grid.y0 - y) / step);
        if (i >= 0 && j >= 0 && i < w && j < h) { const o = (j * w + i) * 3; rgb[o] = rgb[o + 1] = rgb[o + 2] = 255; }
      }
    }
  }
  return { rgb, w, h, lo, hi };
}

export async function makeHeight(slugOrPath, o = {}) {
  const out = (o.out ?? 'E:/ClaudeTemp/T340').replace(/\\/g, '/'), z = +(o.z ?? 15), margin = +(o.margin ?? 520);
  const file = slugOrPath.endsWith('.json') ? slugOrPath : `${out}/${slugOrPath}.json`, slug = file.replace(/^.*[\\/]/, '').replace(/\.json$/, '');
  const J = JSON.parse(readFileSync(file, 'utf8')), c = J.meta.centre, b = J.meta.boundsM;
  if (!c || !b) throw new Error(`${file}: no meta.centre / meta.boundsM (a stage-1 JSON is wanted)`);
  const T = await loadTerrarium();
  // the window: the boundary and a margin (the skirt the game fades the land out over, and room for the smoothing)
  const win = [b.minX - margin, b.minY - margin, b.maxX + margin, b.maxY + margin];
  const keys = T.tilesFor(c, [win[0] - 60, win[1] - 60, win[2] + 60, win[3] + 60], z);
  log(`${slug}: window ${Math.round(win[2] - win[0])} x ${Math.round(win[3] - win[1])} m about ${c.lat}, ${c.lon}; ${keys.length} tiles at zoom ${z}`);
  const { tiles, sources, fetched } = await fetchTiles(T, keys, { rawDir: `${out}/dem/raw`, refresh: !!o.refresh });
  const src = T.demSourceOf(sources.join(','));
  const sigma = o.sigma != null ? +o.sigma : src.sigma;
  const t0 = performance.now();
  const raw = T.sampleTiles(tiles, c, [win[0] - 3 * sigma, win[1] - 3 * sigma, win[2] + 3 * sigma, win[3] + 3 * sigma], 4, z);
  const smooth = T.cropGrid(T.smoothGrid(raw, sigma), win);
  const rng = T.gridRange(smooth), pack = await T.packGrid(smooth);
  log(`  source ${src.label} (imagery: ${sources.join(', ') || 'unknown'}); smoothed with a Gaussian of ${sigma} m; ${smooth.w} x ${smooth.h} samples at 4 m; heights ${rng.min.toFixed(1)} to ${rng.max.toFixed(1)} m (${(rng.max - rng.min).toFixed(1)} m of relief, ${(rng.p95 - rng.p5).toFixed(1)} m from p5 to p95); ${Math.round(performance.now() - t0)} ms; ${fetched} tiles fetched, ${tiles.size - fetched} from the cache`);
  const doc = { meta: { slug, z, centre: c, sigma, src: src.id, label: src.label, credit: src.credit, tilesCredit: T.DEM_TILES_CREDIT, imagery: sources, fetchedAt: new Date().toISOString(), range: { min: +rng.min.toFixed(2), max: +rng.max.toFixed(2) } }, pack };
  const heightFile = `${out}/${slug}.height.json`;
  writeFileSync(heightFile, JSON.stringify(doc) + '\n');
  // the preview
  try {
    const sharp = (await import('sharp')).default, sh = shadePng(smooth, J.features?.hole ?? []);
    const pngFile = `${out}/${slug}-height.png`;
    await sharp(sh.rgb, { raw: { width: sh.w, height: sh.h, channels: 3 } }).png().toFile(pngFile);
    log(`wrote ${heightFile} (${(JSON.stringify(doc).length / 1024).toFixed(0)} kB)\nwrote ${pngFile}`);
  } catch (e) { log(`wrote ${heightFile}; no preview (${e.message})`); }
  return { doc, grid: smooth };
}

// run as a script
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const argv = process.argv.slice(2), opts = {}, words = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) { const k = argv[i].slice(2); opts[k] = k === 'refresh' ? true : argv[++i]; } else words.push(argv[i]); }
  if (!words.length || opts.help) { log('usage: node scripts/dev/osm-height.mjs <slug | stage-1.json> [--margin 520] [--sigma 15] [--z 15] [--out E:/ClaudeTemp/T340] [--refresh]'); process.exit(opts.help ? 0 : 2); }
  makeHeight(words[0], opts).catch(e => { console.error('FAILED: ' + e.message); process.exitCode = 1; });
}

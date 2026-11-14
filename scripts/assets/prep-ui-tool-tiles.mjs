// Explicit sheet identities prevent a new subject grid from overwriting an older menu icon.
// node scripts/assets/prep-ui-tool-tiles.mjs [sheet.png] [--version v1|v2|v3|v4|v5|v6|v7|v8|v9] [--manifest file.json]
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SHEET_NAMES = {
  v1: [['tee', 'fairway', 'green', 'bunker'], ['pond', 'rough', 'trees', 'rocks'], ['cart-path', 'clubhouse', 'range-bays', 'flower-bed']],
  v2: [['waste-sand', 'snack-hut', 'golf-hole', 'grandstand-scoreboard'], ['land-plot', 'autumn-shrubs', 'palms', 'street-furniture'], ['patio-table', 'long-grass', 'chipping-green', 'surveyor-turf']],
  // J8 (#1261): the action tiles, the pictures on the jam's buttons (the range card, the Bank, the hole card, the title card, the tips, the drills)
  v3: [['buy-range', 'hit-balls', 'chip-and-putt', 'clear-junk'], ['pick-balls', 'hire-attendant', 'ball-washer', 'bucket-price'], ['turf-tee', 'grass-outfield', 'target-green', 'covered-bays']],
  v4: [['open-bays', 'ball-dispenser', 'gravel-car-park', 'paved-car-park'], ['putting-green', 'play-hole', 'edit-hole', 'frame-trees'], ['draw-drive', 'seed', 'sod', 'bulldoze']],
  v5: [['bank', 'borrow', 'repay', 'save-money'], ['take-money', 'statement', 'tips', 'how-to-play'], ['settings', 'save-game', 'new-game', 'profile']],
  v6: [['drill-distance', 'drill-shaping', 'drill-flight', 'drill-junk'], ['drill-up-down', 'drill-putting', 'drill-bunker', 'shot-draw'], ['shot-fade', 'shot-high', 'shot-low', 'shot-spin']],
  // J8, the second pair: the tutorial and guide steps, the rail and top bar, the range card's shift and scene, and the golf view's clubs and buttons
  v7: [['place-range', 'walking-path', 'sell-buckets', 'select-tool'], ['walk', 'find-me', 'game-speed', 'zoom'], ['shift-hours', 'scene', 'daylight', 'earthworks']],
  v8: [['club-driver', 'club-wood', 'club-long-iron', 'club-iron'], ['club-wedge', 'club-putter', 'jump-to-ball', 'gimme'], ['go-for-it', 'back-to-course', 'help-keys', 'closed-gate']],
  // J8, the last sheet: the sound tiles (kept for J11, #1270: the music radio and the sound settings), Settings' rows and the title card's Continue
  v9: [['radio', 'boombox', 'headphones', 'bell'], ['radio-off', 'jukebox', 'currency', 'text-size'], ['colour-safe', 'backups', 'load-save', 'front-door']],
};
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function sheetVersion(source, explicit) {
  const detected = /^golf-build-tool-tiles-sheet-(v[1-9])\.png$/i.exec(path.basename(source))?.[1].toLowerCase();
  if (explicit && !SHEET_NAMES[explicit]) throw Error('Unknown menu sheet version: ' + explicit);
  if (detected && explicit && detected !== explicit) throw Error(`Sheet filename is ${detected}, not ${explicit}`);
  const version = explicit ?? detected;
  if (!version) throw Error('Unrecognised sheet filename: specify --version v1 to v9; never guess the subject order');
  return version;
}

/** Cut the actual navy-card grid, retain the native source, and make normal 144px runtime icons. */
export async function prepUiToolTiles({ source, version, outputDir = 'src/assets/ui/tiles', size = 144, manifestFile } = {}) {
  version = sheetVersion(source, version);
  const names = SHEET_NAMES[version], bytes = await fs.readFile(source);
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels, ground = [data[0], data[1], data[2]];
  const on = (x, y) => { const i = (y * W + x) * C; return Math.abs(data[i] - ground[0]) + Math.abs(data[i + 1] - ground[1]) + Math.abs(data[i + 2] - ground[2]) > 24; };
  function bands(n, m, hit) {
    const out = []; let inside = false, start = 0;
    for (let a = 0; a <= n; a++) {
      let count = 0; if (a < n) for (let b = 0; b < m; b++) if (hit(a, b)) count++;
      const yes = count > m / 5;
      if (yes && !inside) { inside = true; start = a; }
      else if (!yes && inside) { inside = false; if (a - start > 40) out.push([start, a]); }
    }
    return out;
  }
  const rows = bands(H, W, (y, x) => on(x, y)), cols = bands(W, H, (x, y) => on(x, y));
  if (rows.length !== 3 || cols.length !== 4) throw Error(`Expected a 4 x 3 grid, found ${cols.length} x ${rows.length}; no assets written`);
  const radius = Math.round(size * 0.12), mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  const tiles = [];
  for (const [r, [y0, y1]] of rows.entries()) for (const [c, [x0, x1]] of cols.entries()) {
    const side = Math.min(x1 - x0, y1 - y0) - 2;
    const sourceRect = { left: x0 + Math.round((x1 - x0 - side) / 2), top: y0 + Math.round((y1 - y0 - side) / 2), width: side, height: side };
    const png = await sharp(bytes).extract(sourceRect).resize(size, size, { kernel: 'lanczos3' }).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
    tiles.push({ name: names[r][c], row: r, column: c, sourceRect, file: path.join(outputDir, names[r][c] + '.webp').replaceAll('\\', '/'), dimensions: [size, size], sha256: hash(png), bytes: png.length, buffer: png });
  }
  await fs.mkdir(outputDir, { recursive: true });
  for (const tile of tiles) await fs.writeFile(tile.file, tile.buffer);
  const manifest = { schema: 1, version, source: { file: source.replaceAll('\\', '/'), sha256: hash(bytes), dimensions: [W, H] }, grid: { columns: 4, rows: 3, detectedRows: rows, detectedColumns: cols }, processing: 'Source unchanged; detected card crops, normal UI resize to144px, rounded-corner alpha mask, WebP encoding.', tiles: tiles.map(({ buffer, ...tile }) => tile) };
  if (manifestFile) { await fs.mkdir(path.dirname(manifestFile), { recursive: true }); await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n'); }
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = key => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1]; };
  const explicit = option('--version'), source = args[0] && !args[0].startsWith('--') ? args[0] : `art/theme-consistency/generated/ui/golf-build-tool-tiles-sheet-${explicit ?? 'v1'}.png`;
  const result = await prepUiToolTiles({ source, version: explicit, manifestFile: option('--manifest') });
  console.log(`${result.tiles.length} ${result.version} tiles -> src/assets/ui/tiles (144px); source ${result.source.dimensions.join('x')} unchanged`);
}

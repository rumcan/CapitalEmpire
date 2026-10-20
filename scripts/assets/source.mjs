// Where the art comes from: a local TrickOrTreat checkout (TOT_REPO, default ../TrickOrTreat), else GitHub.
// Ground art lives on the branch town/builder-in-repo; the sprite export lives in public/assets/town-built on main.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** TrickOrTreat: TOT_REPO, else the sibling of this checkout, else the sibling of the main checkout (from a .claude/worktrees/<name> worktree) */
export const TOT = path.resolve(process.env.TOT_REPO || [path.join(ROOT, '../TrickOrTreat'), path.join(ROOT, '../../../../TrickOrTreat')].find(p => fs.existsSync(path.join(p, '.git'))) || path.join(ROOT, '../TrickOrTreat'));
const RAW = 'https://raw.githubusercontent.com/rumcan/TrickOrTreat';
const hasRepo = fs.existsSync(path.join(TOT, '.git'));

/** a file from a branch of the TrickOrTreat repo (git show, so no worktree is touched) */
export async function fromBranch(branch, rel) {
  if (hasRepo) {
    try { return execFileSync('git', ['-C', TOT, 'show', `${branch}:${rel}`], { maxBuffer: 256 << 20 }); } catch { /* fall through to GitHub */ }
  }
  const res = await fetch(`${RAW}/${branch}/${rel}`);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** a file from the public game export (working tree first, it is committed on main) */
export async function fromExport(rel) {
  const local = path.join(TOT, 'public/assets/town-built', rel);
  if (fs.existsSync(local)) return fs.readFileSync(local);
  return fromBranch('main', 'public/assets/town-built/' + rel);
}

// ---- the full town builder library (local TrickOrTreat checkout only; read only)
// The same roles and collision as TrickOrTreat's game export (scripts/town-builder/export-game.mjs role(), collision-overrides.json).
const VENUE = /^(town:(bakery|barber|fish_tackle|grocery|hardware|laundromat|pharmacy|postoffice|firestation)|ref:building-(corner-shop|corner-store|grocery|church|school|barn|barn-v2)|world:(diner|video_rental|video|church|school|primary_school|snack_bar|barn))$/;
const HOUSE = /^(world:house_\d|gen:house-|expansion:rundown-house$)/;
const FENCE = /^(world:hedge|world:fence_|world:gate|gen:fence-|gen:wall-|expansion:(picket|chainlink|gate-chainlink|fence-privacy)-)/;
const BUILDING_CATS = /^(Houses|Shops & services|Landmarks & venues|House backs|House rear & side views|Derelict town|New industrial buildings)$/;
/** the export's role fields for a library item (variations take the role of the sprite they vary) */
export function roleOf(it) {
  const id = (it.tags || []).find(t => t.startsWith('variation-of:'))?.slice(13) ?? it.id, c = it.category;
  if (id === 'world:arcade') return { kind: 'arcade', door: true, solid: 2, big: true };
  if (HOUSE.test(id) && id === it.id) return { kind: 'house', door: true, solid: 2, big: true };
  if (VENUE.test(id) && id === it.id) return { kind: 'venue', door: true, solid: 2, big: true };
  if (FENCE.test(id)) return { kind: it.fence?.axis === 'y' ? 'fencey' : 'fencex', solid: 1, big: false };
  if (c === 'Vehicles') return { kind: 'car', solid: 2, big: true };
  if (c === 'Trees & plants') return /tree/.test(id) ? { kind: 'tree', solid: 2, big: false } : { kind: 'bush', solid: 1, big: false };
  if (BUILDING_CATS.test(c) || HOUSE.test(id) || VENUE.test(id)) return { kind: 'building', solid: 2, big: true };
  if (/pumpkin/.test(id)) return { kind: 'pumpkin', solid: 1, big: false };
  return { kind: 'decor', solid: 1, big: false };
}
const SKIP_CATS = /^(Kids \(for scale\)|Shadows|Townspeople)$/;
/** every upright library sprite not in `have`, shaped like an export item, with `src` its painted file; {} without a local checkout */
export async function libraryItems(have) {
  const dir = path.join(TOT, 'output/town-builder/library'), file = path.join(dir, 'library.json');
  if (!fs.existsSync(file)) { console.warn(`no TrickOrTreat library at ${file}: only the export is packed`); return {}; }
  let ovr = {}; try { ovr = JSON.parse((await fromBranch('main', 'scripts/town-builder/collision-overrides.json')).toString()); } catch { /* none */ }
  const out = {};
  for (const it of JSON.parse(fs.readFileSync(file, 'utf8')).items) {
    // a fence needs the builder's projected render (export-game.mjs fenceBuf); without it the raw art is wrong, so skip
    if (have.has(it.id) || it.flat || it.hidden || it.fence || SKIP_CATS.test(it.category) || !fs.existsSync(path.join(dir, it.file))) continue;
    const boxes = (ovr[it.id]?.boxes || [it.base || { hx: it.fw, hy: it.fh, dx: 0, dy: 0 }]).map(b => ({ hx: +b.hx.toFixed(3), hy: +b.hy.toFixed(3), dx: +(b.dx || 0).toFixed(3), dy: +(b.dy || 0).toFixed(3) }));
    out[it.id] = { name: it.name, cat: it.category, file: it.file, src: path.join(dir, it.file), w: it.w, h: it.h, ax: it.ax, ay: it.ay, boxes,
      ...(it.glows ? { glows: it.glows } : {}), ...(ovr[it.id]?.door ? { doorAt: ovr[it.id].door } : {}), ...roleOf(it) };
  }
  return out;
}
